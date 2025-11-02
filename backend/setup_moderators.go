package main

import (
	"context"
	"fmt"
	"log"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
	"mindbridge/backend/prisma/db"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	// Initialize Prisma client
	client := db.NewClient()
	if err := client.Prisma.Connect(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer func() {
		if err := client.Prisma.Disconnect(); err != nil {
			log.Printf("Failed to disconnect: %v", err)
		}
	}()

	ctx := context.Background()

	// Clear all existing users and related data
	fmt.Println("🗑️  Clearing existing users and all related data...")

	// Delete all circle memberships first (due to foreign key constraints)
	_, err := client.CircleMembership.FindMany().Delete().Exec(ctx)
	if err != nil {
		log.Printf("Warning: Failed to delete circle memberships: %v", err)
	} else {
		fmt.Println("   ✓ Deleted circle memberships")
	}

	// Delete all circles
	_, err = client.Circle.FindMany().Delete().Exec(ctx)
	if err != nil {
		log.Printf("Warning: Failed to delete circles: %v", err)
	} else {
		fmt.Println("   ✓ Deleted circles")
	}

	// Delete all onboarding responses
	_, err = client.OnboardingResponse.FindMany().Delete().Exec(ctx)
	if err != nil {
		log.Printf("Warning: Failed to delete onboarding responses: %v", err)
	} else {
		fmt.Println("   ✓ Deleted onboarding responses")
	}

	// Delete all users
	_, err = client.User.FindMany().Delete().Exec(ctx)
	if err != nil {
		log.Fatalf("Failed to delete users: %v", err)
	}
	fmt.Println("   ✓ Deleted users")

	fmt.Println("✅ All existing data cleared successfully!\n")

	// Create 2 moderator accounts
	moderators := []struct {
		fullName    string
		email       string
		phoneNumber string
		password    string
	}{
		{
			fullName:    "Dr. Sarah Mitchell",
			email:       "sarah.mitchell@mindbridge.com",
			phoneNumber: "+919876543210",
			password:    "moderator123",
		},
		{
			fullName:    "Dr. James Chen",
			email:       "james.chen@mindbridge.com",
			phoneNumber: "+919876543211",
			password:    "moderator123",
		},
	}

	fmt.Println("👥 Creating moderator accounts...")
	for i, mod := range moderators {
		// Hash password
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(mod.password), bcrypt.DefaultCost)
		if err != nil {
			log.Fatalf("Failed to hash password for %s: %v", mod.fullName, err)
		}

		// Create moderator user
		user, err := client.User.CreateOne(
			db.User.Email.Set(mod.email),
			db.User.FullName.Set(mod.fullName),
			db.User.PhoneNumber.Set(mod.phoneNumber),
			db.User.Password.Set(string(hashedPassword)),
			db.User.Role.Set(db.UserRoleModerator),
			db.User.OnboardingCompleted.Set(true),
		).Exec(ctx)

		if err != nil {
			log.Fatalf("Failed to create moderator %s: %v", mod.fullName, err)
		}

		fmt.Printf("   %d. Created: %s (%s)\n", i+1, user.FullName, user.Email)
	}

	fmt.Println("\n✅ Setup complete!")
	fmt.Println("\n📝 Moderator credentials have been saved to MODERATOR_CREDENTIALS.md")
	fmt.Println("   Please check the file for login details.")
}
