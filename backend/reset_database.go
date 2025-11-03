package main

import (
	"context"
	"log"

	"golang.org/x/crypto/bcrypt"
	"mindbridge/backend/prisma/db"
)

func resetDatabase() {
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

	// Delete all data in order (respecting foreign key constraints)
	log.Println("Deleting all MessageReads...")
	if _, err := client.MessageRead.FindMany().Delete().Exec(ctx); err != nil {
		log.Printf("Warning: Failed to delete MessageReads: %v", err)
	}

	log.Println("Deleting all Messages...")
	if _, err := client.Message.FindMany().Delete().Exec(ctx); err != nil {
		log.Printf("Warning: Failed to delete Messages: %v", err)
	}

	log.Println("Deleting all CircleMemberships...")
	if _, err := client.CircleMembership.FindMany().Delete().Exec(ctx); err != nil {
		log.Printf("Warning: Failed to delete CircleMemberships: %v", err)
	}

	log.Println("Deleting all Circles...")
	if _, err := client.Circle.FindMany().Delete().Exec(ctx); err != nil {
		log.Printf("Warning: Failed to delete Circles: %v", err)
	}

	log.Println("Deleting all OnboardingResponses...")
	if _, err := client.OnboardingResponse.FindMany().Delete().Exec(ctx); err != nil {
		log.Printf("Warning: Failed to delete OnboardingResponses: %v", err)
	}

	log.Println("Deleting all Users...")
	if _, err := client.User.FindMany().Delete().Exec(ctx); err != nil {
		log.Printf("Warning: Failed to delete Users: %v", err)
	}

	log.Println("✅ All data deleted successfully!")

	// Create moderators
	log.Println("\nCreating moderator accounts...")

	moderators := []struct {
		Email    string
		Password string
		FullName string
		Phone    string
	}{
		{
			Email:    "sarah.mitchell@mindbridge.com",
			Password: "password123",
			FullName: "Dr. Sarah Mitchell",
			Phone:    "+1-555-0101",
		},
		{
			Email:    "james.chen@mindbridge.com",
			Password: "password123",
			FullName: "Dr. James Chen",
			Phone:    "+1-555-0102",
		},
		{
			Email:    "maria.garcia@mindbridge.com",
			Password: "password123",
			FullName: "Dr. Maria Garcia",
			Phone:    "+1-555-0103",
		},
	}

	for _, mod := range moderators {
		// Hash password using bcrypt
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(mod.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Failed to hash password for %s: %v", mod.Email, err)
			continue
		}

		user, err := client.User.CreateOne(
			db.User.Email.Set(mod.Email),
			db.User.FullName.Set(mod.FullName),
			db.User.PhoneNumber.Set(mod.Phone),
			db.User.Password.Set(string(hashedPassword)),
			db.User.Role.Set(db.UserRoleModerator),
			db.User.OnboardingCompleted.Set(true),
		).Exec(ctx)

		if err != nil {
			log.Printf("Failed to create moderator %s: %v", mod.Email, err)
		} else {
			log.Printf("✅ Created moderator: %s (ID: %s)", mod.FullName, user.ID)
		}
	}

	log.Println("\n✅ Database reset complete!")
	log.Println("You can now sign up as a new user and complete onboarding.")
}

func main() {
	resetDatabase()
}
