package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	socketio "github.com/googollee/go-socket.io"
	"github.com/googollee/go-socket.io/engineio"
	"github.com/googollee/go-socket.io/engineio/transport"
	"github.com/googollee/go-socket.io/engineio/transport/polling"
	transportWebsocket "github.com/googollee/go-socket.io/engineio/transport/websocket"
	"mindbridge/backend/prisma/db"
	"mindbridge/backend/utils"
)

type SocketServer struct {
	server *socketio.Server
	client *db.PrismaClient
}

type MessagePayload struct {
	CircleID  string `json:"circleId"`
	Content   string `json:"content"`
	ImageURL  string `json:"imageUrl,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

type ReadReceiptPayload struct {
	MessageID string `json:"messageId"`
	CircleID  string `json:"circleId"`
}

type MessageResponse struct {
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

func NewSocketServer(client *db.PrismaClient) (*SocketServer, error) {
	wsTransport := transportWebsocket.Default
	wsTransport.CheckOrigin = func(r *http.Request) bool {
		return true
	}

	pollingTransport := polling.Default
	pollingTransport.CheckOrigin = func(r *http.Request) bool {
		return true
	}

	server := socketio.NewServer(&engineio.Options{
		Transports: []transport.Transport{pollingTransport, wsTransport},
		RequestChecker: func(r *http.Request) (http.Header, error) {
			headers := http.Header{}
			origin := r.Header.Get("Origin")
			if origin != "" {
				headers.Set("Access-Control-Allow-Origin", origin)
			}
			headers.Set("Access-Control-Allow-Credentials", "true")
			headers.Set("Vary", "Origin")
			return headers, nil
		},
	})

	ss := &SocketServer{
		server: server,
		client: client,
	}

	ss.setupHandlers()
	return ss, nil
}

func (ss *SocketServer) setupHandlers() {
	ss.server.OnConnect("/", func(s socketio.Conn) error {
		log.Printf("Socket connected: %s", s.ID())

		urlCopy := s.URL()
		values := (&urlCopy).Query()
		token := values.Get("token")
		if token != "" {
			if !ss.authenticateConnection(s, token) {
				return nil
			}
		}
		return nil
	})

	ss.server.OnEvent("/", "authenticate", func(s socketio.Conn, token string) {
		log.Printf("Authenticate event for socket %s (token length: %d)", s.ID(), len(token))
		ss.authenticateConnection(s, token)
	})

	ss.server.OnEvent("/", "send_message", func(s socketio.Conn, data string) {
		ctx := context.Background()
		userID, ok := getUserIDFromConn(s)
		if !ok {
			log.Printf("Unauthorized message send attempt from socket %s", s.ID())
			s.Emit("message_error", "Not authenticated")
			return
		}

		var payload MessagePayload
		if err := json.Unmarshal([]byte(data), &payload); err != nil {
			log.Printf("Invalid message payload: %v", err)
			s.Emit("message_error", "Invalid message format")
			return
		}

		payload.Content = strings.TrimSpace(payload.Content)
		if payload.CircleID == "" || payload.Content == "" {
			log.Printf("Invalid message payload from user %s: missing circle or content", userID)
			s.Emit("message_error", "Circle and message content are required")
			return
		}

		allowed, err := ss.userHasCircleAccess(ctx, payload.CircleID, userID)
		if err != nil {
			log.Printf("Failed to verify circle access for user %s: %v", userID, err)
			s.Emit("message_error", "Server error")
			return
		}

		if !allowed {
			log.Printf("User %s not authorized to send to circle %s", userID, payload.CircleID)
			s.Emit("message_error", "Not authorized to send to this circle")
			return
		}

		log.Printf("User %s sending message to circle %s", userID, payload.CircleID)

		ensureRoomMembership(s, payload.CircleID)

		// Create message in database
		message, err := ss.client.Message.CreateOne(
			db.Message.Circle.Link(db.Circle.ID.Equals(payload.CircleID)),
			db.Message.Sender.Link(db.User.ID.Equals(userID)),
			db.Message.Content.Set(payload.Content),
			db.Message.ImageURL.SetIfPresent(
				func() *string {
					if payload.ImageURL != "" {
						return &payload.ImageURL
					}
					return nil
				}(),
			),
		).With(
			db.Message.Sender.Fetch(),
		).Exec(ctx)

		if err != nil {
			log.Printf("Failed to create message: %v", err)
			s.Emit("message_error", "Failed to send message")
			return
		}

		sender := message.Sender()

		// Get optional fields
		var profilePic *string
		if pic, ok := sender.ProfilePicture(); ok {
			profilePic = &pic
		}

		var imageURL *string
		if img, ok := message.ImageURL(); ok {
			imageURL = &img
		}


		// Automatically mark message as read by the sender
		_, err = ss.client.MessageRead.CreateOne(
			db.MessageRead.Message.Link(db.Message.ID.Equals(message.ID)),
			db.MessageRead.User.Link(db.User.ID.Equals(userID)),
		).Exec(ctx)

		if err != nil {
			log.Printf("Failed to create read receipt for sender: %v", err)
			// Continue anyway - this is not critical
		}

		// Prepare message response
		response := MessageResponse{
			ID:           message.ID,
			CircleID:     message.CircleID,
			SenderID:     sender.ID,
			SenderName:   sender.FullName,
			SenderAvatar: profilePic,
			Content:      message.Content,
			ImageURL:     imageURL,
			CreatedAt:    message.CreatedAt.Format(time.RFC3339),
			ReadBy:       []string{userID}, // Sender has read their own message
		}

		log.Printf("Message %s created by user %s in circle %s", message.ID, userID, payload.CircleID)

		// Broadcast to all users in the circle
		ss.server.BroadcastToRoom("/", payload.CircleID, "new_message", response)
	})

	ss.server.OnEvent("/", "mark_read", func(s socketio.Conn, data string) {
		ctx := context.Background()
		userID, ok := getUserIDFromConn(s)
		if !ok {
			log.Printf("Unauthorized read receipt from socket %s", s.ID())
			return
		}

		var payload ReadReceiptPayload
		if err := json.Unmarshal([]byte(data), &payload); err != nil {
			log.Printf("Invalid read receipt payload: %v", err)
			return
		}

		if payload.CircleID == "" || payload.MessageID == "" {
			log.Printf("Read receipt missing identifiers from user %s", userID)
			return
		}

		allowed, err := ss.userHasCircleAccess(ctx, payload.CircleID, userID)
		if err != nil {
			log.Printf("Failed to verify circle access for user %s: %v", userID, err)
			return
		}

		if !allowed {
			log.Printf("User %s not authorized to mark messages in circle %s", userID, payload.CircleID)
			return
		}

		log.Printf("User %s marking message %s as read in circle %s", userID, payload.MessageID, payload.CircleID)

		existing, _ := ss.client.MessageRead.FindFirst(
			db.MessageRead.MessageID.Equals(payload.MessageID),
			db.MessageRead.UserID.Equals(userID),
		).Exec(ctx)

		if existing != nil {
			return
		}

		_, err = ss.client.MessageRead.CreateOne(
			db.MessageRead.Message.Link(db.Message.ID.Equals(payload.MessageID)),
			db.MessageRead.User.Link(db.User.ID.Equals(userID)),
		).Exec(ctx)

		if err != nil {
			log.Printf("Failed to create read receipt: %v", err)
			return
		}

		// Get all read receipts for this message
		readReceipts, err := ss.client.MessageRead.FindMany(
			db.MessageRead.MessageID.Equals(payload.MessageID),
		).Exec(ctx)

		if err != nil {
			log.Printf("Failed to fetch read receipts: %v", err)
			return
		}

		readByUserIDs := make([]string, len(readReceipts))
		for i, receipt := range readReceipts {
			readByUserIDs[i] = receipt.UserID
		}

		log.Printf("Message %s marked as read by user %s", payload.MessageID, userID)

		// Broadcast read receipt update to all users in the circle
		ss.server.BroadcastToRoom("/", payload.CircleID, "message_read", map[string]interface{}{
			"messageId": payload.MessageID,
			"userId":    userID,
			"readBy":    readByUserIDs,
		})
	})

	ss.server.OnEvent("/", "typing_start", func(s socketio.Conn, circleID string) {
		socketCtx := s.Context()
		userID, ok := socketCtx.(map[string]interface{})["userID"].(string)
		if !ok {
			return
		}

		// Broadcast to others in the circle (not to self)
		rooms := s.Rooms()
		for _, room := range rooms {
			if room == circleID {
				ss.server.BroadcastToRoom("/", circleID, "user_typing", map[string]interface{}{
					"userId": userID,
					"typing": true,
				})
				break
			}
		}
	})

	ss.server.OnEvent("/", "typing_stop", func(s socketio.Conn, circleID string) {
		socketCtx := s.Context()
		userID, ok := socketCtx.(map[string]interface{})["userID"].(string)
		if !ok {
			return
		}

		// Broadcast to others in the circle (not to self)
		rooms := s.Rooms()
		for _, room := range rooms {
			if room == circleID {
				ss.server.BroadcastToRoom("/", circleID, "user_typing", map[string]interface{}{
					"userId": userID,
					"typing": false,
				})
				break
			}
		}
	})

	ss.server.OnDisconnect("/", func(s socketio.Conn, reason string) {
		log.Printf("Socket disconnected: %s, reason: %s", s.ID(), reason)
	})

	ss.server.OnError("/", func(s socketio.Conn, e error) {
		log.Printf("Socket error: %v", e)
	})
}

func (ss *SocketServer) authenticateConnection(s socketio.Conn, token string) bool {
	ctx := context.Background()

	claims, err := utils.ValidateJWT(token)
	if err != nil {
		log.Printf("Authentication failed for socket %s: %v", s.ID(), err)
		s.Emit("auth_error", "Invalid token")
		s.Close()
		return false
	}

	userID := claims.UserID
	log.Printf("User %s authenticated via socket %s", userID, s.ID())

	// Store user info in context
	ctxMap, _ := s.Context().(map[string]interface{})
	if ctxMap == nil {
		ctxMap = make(map[string]interface{})
	}
	ctxMap["userID"] = userID
	s.SetContext(ctxMap)

	membership, err := ss.client.CircleMembership.FindFirst(
		db.CircleMembership.UserID.Equals(userID),
	).With(
		db.CircleMembership.Circle.Fetch(),
	).Exec(ctx)

	if err != nil && !errors.Is(err, db.ErrNotFound) {
		log.Printf("Failed to fetch membership for user %s: %v", userID, err)
		s.Emit("auth_error", "Server error")
		s.Close()
		return false
	}

	if membership != nil {
		circle := membership.Circle()
		circleID := circle.ID

		s.Join(circleID)
		log.Printf("User %s joined circle room %s", userID, circleID)

		memberships, _ := ss.client.CircleMembership.FindMany(
			db.CircleMembership.CircleID.Equals(circleID),
		).Exec(ctx)

		s.Emit("auth_success", map[string]interface{}{
			"userId":      userID,
			"circleId":    circleID,
			"circleName":  circle.Name,
			"memberCount": len(memberships),
		})

		return true
	}

	moderatorCircle, err := ss.client.Circle.FindFirst(
		db.Circle.ModeratorID.Equals(userID),
	).With(
		db.Circle.Memberships.Fetch(),
	).Exec(ctx)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			log.Printf("User %s has no circle membership", userID)
			s.Emit("auth_success", map[string]interface{}{
				"userId":   userID,
				"circleId": nil,
			})
			return true
		}
		log.Printf("Failed to fetch moderator circle for user %s: %v", userID, err)
		s.Emit("auth_error", "Server error")
		s.Close()
		return false
	}

	circleID := moderatorCircle.ID
	s.Join(circleID)
	log.Printf("Moderator %s joined circle room %s", userID, circleID)

	s.Emit("auth_success", map[string]interface{}{
		"userId":      userID,
		"circleId":    circleID,
		"circleName":  moderatorCircle.Name,
		"memberCount": len(moderatorCircle.Memberships()),
	})

	return true
}

func (ss *SocketServer) GetServer() *socketio.Server {
	return ss.server
}

func (ss *SocketServer) userHasCircleAccess(ctx context.Context, circleID, userID string) (bool, error) {
	membership, err := ss.client.CircleMembership.FindFirst(
		db.CircleMembership.UserID.Equals(userID),
		db.CircleMembership.CircleID.Equals(circleID),
	).Exec(ctx)

	if err == nil && membership != nil {
		return true, nil
	}

	if err != nil && !errors.Is(err, db.ErrNotFound) {
		log.Printf("userHasCircleAccess: error checking membership: %v", err)
		return false, err
	}

	circle, err := ss.client.Circle.FindUnique(
		db.Circle.ID.Equals(circleID),
	).Exec(ctx)
	if err != nil {
		if errors.Is(err, db.ErrNotFound) {
			log.Printf("userHasCircleAccess: circle %s not found", circleID)
			return false, nil
		}
		log.Printf("userHasCircleAccess: error loading circle %s: %v", circleID, err)
		return false, err
	}

	return circle.ModeratorID == userID, nil
}

func getUserIDFromConn(s socketio.Conn) (string, bool) {
	ctxMap, ok := s.Context().(map[string]interface{})
	if !ok || ctxMap == nil {
		return "", false
	}

	userID, ok := ctxMap["userID"].(string)
	if !ok || userID == "" {
		return "", false
	}

	return userID, true
}

func ensureRoomMembership(s socketio.Conn, circleID string) {
	if circleID == "" {
		return
	}

	for _, room := range s.Rooms() {
		if room == circleID {
			return
		}
	}

	s.Join(circleID)
}

// Helper function to extract token from query params or headers
func extractToken(query string) string {
	// Expected format: token=jwt_token_here
	parts := strings.Split(query, "token=")
	if len(parts) < 2 {
		return ""
	}
	return strings.Split(parts[1], "&")[0]
}
