package handlers

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"mindbridge/backend/prisma/db"
)

type MessageHandler struct {
	client *db.PrismaClient
}

func NewMessageHandler(client *db.PrismaClient) *MessageHandler {
	return &MessageHandler{client: client}
}

type MessageWithSender struct {
	ID           string   `json:"id"`
	CircleID     string   `json:"circleId"`
	SenderID     string   `json:"senderId"`
	SenderName   string   `json:"senderName"`
	SenderAvatar *string  `json:"senderAvatar"`
	Content      string   `json:"content"`
	ImageURL     *string  `json:"imageUrl"`
	CreatedAt    string   `json:"createdAt"`
	ReadBy       []string `json:"readBy"`
}

// GetCircleMessages retrieves messages for a circle
func (h *MessageHandler) GetCircleMessages(c *gin.Context) {
	ctx := context.Background()
	circleID := c.Param("circleId")

	// Get user ID from context (set by auth middleware)
	userIDInterface, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	userID := userIDInterface.(string)

	circle, err := h.client.Circle.FindUnique(
		db.Circle.ID.Equals(circleID),
	).Exec(ctx)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Circle not found"})
		return
	}

	isModerator := circle.ModeratorID == userID

	if !isModerator {
		membership, err := h.client.CircleMembership.FindFirst(
			db.CircleMembership.UserID.Equals(userID),
			db.CircleMembership.CircleID.Equals(circleID),
		).Exec(ctx)
		if err != nil || membership == nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized to view this circle's messages"})
			return
		}
	}

	// Get messages with sender info and read receipts
	messages, err := h.client.Message.FindMany(
		db.Message.CircleID.Equals(circleID),
	).With(
		db.Message.Sender.Fetch(),
		db.Message.ReadReceipts.Fetch(),
	).OrderBy(
		db.Message.CreatedAt.Order(db.ASC),
	).Exec(ctx)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}

	// Transform messages to response format
	responseMessages := make([]MessageWithSender, len(messages))
	for i, msg := range messages {
		sender := msg.Sender()
		readReceipts := msg.ReadReceipts()

		// Get optional fields
		var profilePic *string
		if pic, ok := sender.ProfilePicture(); ok {
			profilePic = &pic
		}

		var imageURL *string
		if img, ok := msg.ImageURL(); ok {
			imageURL = &img
		}

		// Collect read by user IDs
		readBy := make([]string, len(readReceipts))
		for j, receipt := range readReceipts {
			readBy[j] = receipt.UserID
		}

		responseMessages[i] = MessageWithSender{
			ID:           msg.ID,
			CircleID:     msg.CircleID,
			SenderID:     sender.ID,
			SenderName:   sender.FullName,
			SenderAvatar: profilePic,
			Content:      msg.Content,
			ImageURL:     imageURL,
			CreatedAt:    msg.CreatedAt.Format(time.RFC3339),
			ReadBy:       readBy,
		}
	}

	c.JSON(http.StatusOK, responseMessages)
}

// UploadImage handles image uploads for messages
func (h *MessageHandler) UploadImage(c *gin.Context) {
	// Get user ID from context (for authentication check)
	_, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse multipart form
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No image file provided"})
		return
	}
	defer file.Close()

	// Validate file type
	contentType := header.Header.Get("Content-Type")
	allowedTypes := []string{"image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"}
	isValidType := false
	for _, t := range allowedTypes {
		if contentType == t {
			isValidType = true
			break
		}
	}

	if !isValidType {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type. Only images are allowed"})
		return
	}

	// Validate file size (max 5MB)
	if header.Size > 5*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large. Maximum size is 5MB"})
		return
	}

	// Create uploads directory if it doesn't exist
	uploadsDir := "./uploads/messages"
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	// Generate unique filename
	ext := filepath.Ext(header.Filename)
	filename := fmt.Sprintf("%s_%s%s", time.Now().Format("20060102_150405"), uuid.New().String()[:8], ext)
	filePath := filepath.Join(uploadsDir, filename)

	// Save file
	out, err := os.Create(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Return URL for the uploaded image
	// In production, you might want to use a CDN or cloud storage
	imageURL := fmt.Sprintf("/uploads/messages/%s", filename)

	c.JSON(http.StatusOK, gin.H{
		"imageUrl": imageURL,
		"filename": filename,
	})
}

// GetCircleMembers retrieves members of a circle
func (h *MessageHandler) GetCircleMembers(c *gin.Context) {
	ctx := context.Background()
	circleID := c.Param("circleId")

	// Get user ID from context
	userIDInterface, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	userID := userIDInterface.(string)

	circle, err := h.client.Circle.FindUnique(
		db.Circle.ID.Equals(circleID),
	).With(
		db.Circle.Memberships.Fetch().With(
			db.CircleMembership.User.Fetch(),
		),
		db.Circle.Moderator.Fetch(),
	).Exec(ctx)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch circle members"})
		return
	}

	memberships := circle.Memberships()
	moderator := circle.Moderator()
	isModerator := circle.ModeratorID == userID

	if !isModerator {
		allowed := false
		for _, m := range memberships {
			if m.UserID == userID {
				allowed = true
				break
			}
		}
		if !allowed {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized to view this circle"})
			return
		}
	}

	type MemberInfo struct {
		ID             string  `json:"id"`
		FullName       string  `json:"fullName"`
		ProfilePicture *string `json:"profilePicture"`
		IsModerator    bool    `json:"isModerator"`
	}

	members := make([]MemberInfo, len(memberships))
	for i, m := range memberships {
		user := m.User()
		var profilePic *string
		if pic, ok := user.ProfilePicture(); ok {
			profilePic = &pic
		}

		members[i] = MemberInfo{
			ID:             user.ID,
			FullName:       user.FullName,
			ProfilePicture: profilePic,
			IsModerator:    user.ID == moderator.ID,
		}
	}

	// Add moderator if not already in members
	moderatorInMembers := false
	for _, m := range members {
		if m.ID == moderator.ID {
			moderatorInMembers = true
			break
		}
	}

	if !moderatorInMembers {
		var modProfilePic *string
		if pic, ok := moderator.ProfilePicture(); ok {
			modProfilePic = &pic
		}

		members = append(members, MemberInfo{
			ID:             moderator.ID,
			FullName:       moderator.FullName,
			ProfilePicture: modProfilePic,
			IsModerator:    true,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"circleId":   circle.ID,
		"circleName": circle.Name,
		"members":    members,
	})
}

// GetUserCircle gets the current user's circle
func (h *MessageHandler) GetUserCircle(c *gin.Context) {
	ctx := context.Background()

	// Get user ID from context
	userIDInterface, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	userID := userIDInterface.(string)

	membership, err := h.client.CircleMembership.FindFirst(
		db.CircleMembership.UserID.Equals(userID),
	).With(
		db.CircleMembership.Circle.Fetch().With(
			db.Circle.Memberships.Fetch(),
		),
	).Exec(ctx)

	if err == nil && membership != nil {
		circle := membership.Circle()
		memberships := circle.Memberships()

		c.JSON(http.StatusOK, gin.H{
			"circleId":    circle.ID,
			"circleName":  circle.Name,
			"category":    string(circle.Category),
			"memberCount": len(memberships),
			"status":      string(circle.Status),
		})
		return
	}

	if err != nil && !errors.Is(err, db.ErrNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user circle"})
		return
	}

	moderatorCircle, modErr := h.client.Circle.FindFirst(
		db.Circle.ModeratorID.Equals(userID),
	).With(
		db.Circle.Memberships.Fetch(),
	).Exec(ctx)
	if modErr != nil {
		if errors.Is(modErr, db.ErrNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "No circle found for user"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user circle"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"circleId":    moderatorCircle.ID,
		"circleName":  moderatorCircle.Name,
		"category":    string(moderatorCircle.Category),
		"memberCount": len(moderatorCircle.Memberships()),
		"status":      string(moderatorCircle.Status),
	})
	return
}
