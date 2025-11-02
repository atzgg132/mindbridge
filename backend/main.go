package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"mindbridge/backend/handlers"
	"mindbridge/backend/middleware"
	"mindbridge/backend/prisma/db"
	"mindbridge/backend/websocket"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Set Gin mode
	mode := os.Getenv("GIN_MODE")
	if mode == "" {
		mode = "debug"
	}
	gin.SetMode(mode)

	// Initialize Prisma client
	client := db.NewClient()
	if err := client.Prisma.Connect(); err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer func() {
		if err := client.Prisma.Disconnect(); err != nil {
			log.Println("Failed to disconnect from database:", err)
		}
	}()

	log.Println("Successfully connected to database")

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(client)
	onboardingHandler := handlers.NewOnboardingHandler(client)
	messageHandler := handlers.NewMessageHandler(client)

	// Initialize WebSocket server
	socketServer, err := websocket.NewSocketServer(client)
	if err != nil {
		log.Fatal("Failed to create socket server:", err)
	}
	go func() {
		if err := socketServer.GetServer().Serve(); err != nil {
			log.Fatalf("Socket.io server error: %s\n", err)
		}
	}()
	defer socketServer.GetServer().Close()
	log.Println("Socket.io server initialized")

	// Initialize router
	router := gin.Default()

	// CORS middleware
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		AllowWebSockets:  true,
		MaxAge:           12 * time.Hour,
	}))

	// Health check endpoint
	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"message": "MindBridge API is running",
			"timestamp": time.Now().Unix(),
		})
	})

	// API routes group
	api := router.Group("/api")
	{
		// Auth routes (public)
		auth := api.Group("/auth")
		{
			auth.POST("/signup", authHandler.Signup)
			auth.POST("/signin", authHandler.Signin)
			auth.GET("/check-email", authHandler.CheckEmail)
			auth.GET("/check-phone-number", authHandler.CheckPhoneNumber)
			auth.GET("/me", middleware.AuthMiddleware(), authHandler.GetMe)
		}

		// Onboarding routes (protected)
		onboarding := api.Group("/onboarding")
		onboarding.Use(middleware.AuthMiddleware())
		{
			onboarding.GET("", onboardingHandler.GetOnboarding)
			onboarding.POST("", onboardingHandler.SubmitOnboarding)
		}

		// Message routes (protected)
		messages := api.Group("/messages")
		messages.Use(middleware.AuthMiddleware())
		{
			messages.GET("/circle/:circleId", messageHandler.GetCircleMessages)
			messages.GET("/circle/:circleId/members", messageHandler.GetCircleMembers)
			messages.GET("/my-circle", messageHandler.GetUserCircle)
			messages.POST("/upload", messageHandler.UploadImage)
		}

		// Test endpoints
		api.GET("/ping", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"message": "pong",
			})
		})

		// Protected test endpoint
		api.GET("/users/count", middleware.AuthMiddleware(), func(c *gin.Context) {
			ctx := context.Background()
			count, err := client.User.FindMany().Exec(ctx)
			if err != nil {
				c.JSON(500, gin.H{
					"error": "Failed to query database",
				})
				return
			}
			c.JSON(200, gin.H{
				"count": len(count),
				"message": "Database query successful",
			})
		})
	}

	// Socket.io endpoint
	router.GET("/socket.io/*any", gin.WrapH(socketServer.GetServer()))
	router.POST("/socket.io/*any", gin.WrapH(socketServer.GetServer()))

	// Serve uploaded files
	router.Static("/uploads", "./uploads")

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting MindBridge API server on port %s...", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
