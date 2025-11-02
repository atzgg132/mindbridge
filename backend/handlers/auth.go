package handlers

import (
	"context"
	"net/http"
	"regexp"

	"github.com/gin-gonic/gin"
	"mindbridge/backend/prisma/db"
	"mindbridge/backend/utils"
)

type AuthHandler struct {
	client *db.PrismaClient
}

func NewAuthHandler(client *db.PrismaClient) *AuthHandler {
	return &AuthHandler{client: client}
}

type SignupRequest struct {
	FullName       string `json:"fullName" binding:"required"`
	Email          string `json:"email" binding:"required,email"`
	PhoneNumber    string `json:"phoneNumber" binding:"required"`
	Password       string `json:"password" binding:"required"`
	ProfilePicture string `json:"profilePicture"`
}

type SigninRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type AuthResponse struct {
	Token string      `json:"token"`
	User  interface{} `json:"user"`
}

// Signup handles user registration
func (h *AuthHandler) Signup(c *gin.Context) {
	var req SignupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request data",
		})
		return
	}

	ctx := context.Background()

	// Validate email format
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	if !emailRegex.MatchString(req.Email) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid email format",
		})
		return
	}

	// Check if email already exists
	existingUser, _ := h.client.User.FindUnique(
		db.User.Email.Equals(req.Email),
	).Exec(ctx)

	if existingUser != nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": "Email already registered",
		})
		return
	}

	// Validate password strength
	isStrong, message := utils.ValidatePasswordStrength(req.Password)
	if !isStrong {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": message,
		})
		return
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to process password",
		})
		return
	}

	// Create user (always as USER role)
	user, err := h.client.User.CreateOne(
		db.User.Email.Set(req.Email),
		db.User.FullName.Set(req.FullName),
		db.User.PhoneNumber.Set(req.PhoneNumber),
		db.User.Password.Set(hashedPassword),
		db.User.Role.Set(db.UserRoleUser),
		db.User.ProfilePicture.SetIfPresent(&req.ProfilePicture),
	).Exec(ctx)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create user",
		})
		return
	}

	// Generate JWT token
	token, err := utils.GenerateJWT(user.ID, user.Email, string(user.Role), user.OnboardingCompleted)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to generate token",
		})
		return
	}

	// Get profile picture (optional field)
	profilePic, _ := user.ProfilePicture()

	c.JSON(http.StatusCreated, AuthResponse{
		Token: token,
		User: gin.H{
			"id":                  user.ID,
			"email":               user.Email,
			"fullName":            user.FullName,
			"phoneNumber":         user.PhoneNumber,
			"profilePicture":      profilePic,
			"role":                user.Role,
			"onboardingCompleted": user.OnboardingCompleted,
		},
	})
}

// Signin handles user/moderator login
func (h *AuthHandler) Signin(c *gin.Context) {
	var req SigninRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request data",
		})
		return
	}

	ctx := context.Background()

	// Find user by email
	user, err := h.client.User.FindUnique(
		db.User.Email.Equals(req.Email),
	).Exec(ctx)

	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Invalid email or password",
		})
		return
	}

	// Check password
	if !utils.CheckPasswordHash(req.Password, user.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Invalid email or password",
		})
		return
	}

	// Generate JWT token
	token, err := utils.GenerateJWT(user.ID, user.Email, string(user.Role), user.OnboardingCompleted)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to generate token",
		})
		return
	}

	// Get profile picture (optional field)
	profilePic, _ := user.ProfilePicture()

	c.JSON(http.StatusOK, AuthResponse{
		Token: token,
		User: gin.H{
			"id":                  user.ID,
			"email":               user.Email,
			"fullName":            user.FullName,
			"phoneNumber":         user.PhoneNumber,
			"profilePicture":      profilePic,
			"role":                user.Role,
			"onboardingCompleted": user.OnboardingCompleted,
		},
	})
}

// CheckEmail checks if email is available
func (h *AuthHandler) CheckEmail(c *gin.Context) {
	email := c.Query("email")
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Email parameter required",
		})
		return
	}

	ctx := context.Background()

	user, _ := h.client.User.FindUnique(
		db.User.Email.Equals(email),
	).Exec(ctx)

	c.JSON(http.StatusOK, gin.H{
		"available": user == nil,
		"email":     email,
	})
}

// CheckPhoneNumber checks if phone number is available
func (h *AuthHandler) CheckPhoneNumber(c *gin.Context) {
	phoneNumber := c.Query("phoneNumber")
	if phoneNumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Phone number parameter required",
		})
		return
	}

	ctx := context.Background()

	user, _ := h.client.User.FindFirst(
		db.User.PhoneNumber.Equals(phoneNumber),
	).Exec(ctx)

	c.JSON(http.StatusOK, gin.H{
		"available":   user == nil,
		"phoneNumber": phoneNumber,
	})
}

// GetMe returns current authenticated user
func (h *AuthHandler) GetMe(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	ctx := context.Background()

	user, err := h.client.User.FindUnique(
		db.User.ID.Equals(userID.(string)),
	).Exec(ctx)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "User not found",
		})
		return
	}

	// Get profile picture (optional field)
	profilePic, _ := user.ProfilePicture()

	c.JSON(http.StatusOK, gin.H{
		"id":                  user.ID,
		"email":               user.Email,
		"fullName":            user.FullName,
		"phoneNumber":         user.PhoneNumber,
		"profilePicture":      profilePic,
		"role":                user.Role,
		"onboardingCompleted": user.OnboardingCompleted,
		"createdAt":           user.CreatedAt,
	})
}
