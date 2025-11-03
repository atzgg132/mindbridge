package handlers

import (
	"context"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"mindbridge/backend/prisma/db"
	"mindbridge/backend/services"
)

type InstantHelpHandler struct {
	geminiService *services.GeminiService
	client        *db.PrismaClient
}

func NewInstantHelpHandler(client *db.PrismaClient, apiKey string) *InstantHelpHandler {
	return &InstantHelpHandler{
		geminiService: services.NewGeminiService(apiKey),
		client:        client,
	}
}

type ChatMessage struct {
	Role string `json:"role"` // "user" or "model"
	Text string `json:"text"`
}

type ChatRequest struct {
	Message string        `json:"message"`
	History []ChatMessage `json:"history"`
}

type ChatResponse struct {
	Response string `json:"response"`
}

// Chat handles instant help chat requests
func (h *InstantHelpHandler) Chat(c *gin.Context) {
	ctx := context.Background()

	// Only authenticated users can access instant help
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}
	userIDStr := userID.(string)

	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
		return
	}

	if req.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message cannot be empty"})
		return
	}

	log.Printf("Instant help request from user %s: %s", userIDStr, req.Message)

	// Convert history to Gemini format
	geminiHistory := make([]services.GeminiMessage, len(req.History))
	for i, msg := range req.History {
		geminiHistory[i] = services.GeminiMessage{
			Role: msg.Role,
			Text: msg.Text,
		}
	}

	// Get response from Gemini
	response, err := h.geminiService.Chat(geminiHistory, req.Message)
	if err != nil {
		log.Printf("Gemini API error for user %s: %v", userIDStr, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to get response from Anchor. Please try again.",
		})
		return
	}

	log.Printf("Instant help response for user %s: %s", userIDStr, response)

	// Save user message to database
	_, err = h.client.InstantHelpMessage.CreateOne(
		db.InstantHelpMessage.User.Link(db.User.ID.Equals(userIDStr)),
		db.InstantHelpMessage.Role.Set("user"),
		db.InstantHelpMessage.Content.Set(req.Message),
	).Exec(ctx)
	if err != nil {
		log.Printf("Failed to save user message for user %s: %v", userIDStr, err)
		// Continue anyway - don't fail the request
	}

	// Save model response to database
	_, err = h.client.InstantHelpMessage.CreateOne(
		db.InstantHelpMessage.User.Link(db.User.ID.Equals(userIDStr)),
		db.InstantHelpMessage.Role.Set("model"),
		db.InstantHelpMessage.Content.Set(response),
	).Exec(ctx)
	if err != nil {
		log.Printf("Failed to save model response for user %s: %v", userIDStr, err)
		// Continue anyway - don't fail the request
	}

	c.JSON(http.StatusOK, ChatResponse{
		Response: response,
	})
}

// GetHistory retrieves the chat history for the authenticated user
func (h *InstantHelpHandler) GetHistory(c *gin.Context) {
	ctx := context.Background()

	// Only authenticated users can access instant help
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}
	userIDStr := userID.(string)

	// Fetch messages from database
	messages, err := h.client.InstantHelpMessage.FindMany(
		db.InstantHelpMessage.UserID.Equals(userIDStr),
	).OrderBy(
		db.InstantHelpMessage.CreatedAt.Order(db.ASC),
	).Exec(ctx)

	if err != nil {
		log.Printf("Failed to fetch instant help history for user %s: %v", userIDStr, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve chat history",
		})
		return
	}

	// Convert to response format
	history := make([]ChatMessage, len(messages))
	for i, msg := range messages {
		history[i] = ChatMessage{
			Role: msg.Role,
			Text: msg.Content,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"history": history,
	})
}
