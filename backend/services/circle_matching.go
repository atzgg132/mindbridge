package services

import (
	"context"
	"fmt"
	"log"
	"strings"

	"mindbridge/backend/prisma/db"
)

type CircleMatchingService struct {
	client *db.PrismaClient
}

func NewCircleMatchingService(client *db.PrismaClient) *CircleMatchingService {
	return &CircleMatchingService{client: client}
}

// DetermineCircleCategory determines the appropriate circle category based on topics
func (s *CircleMatchingService) DetermineCircleCategory(topics []string) db.CircleCategory {
	// Convert topics to lowercase for matching
	topicsLower := make([]string, len(topics))
	for i, topic := range topics {
		topicsLower[i] = strings.ToLower(topic)
	}

	// Crisis indicators - highest priority
	crisisKeywords := []string{"self", "harm", "suicide", "hopeless"}
	for _, topic := range topicsLower {
		for _, keyword := range crisisKeywords {
			if strings.Contains(topic, keyword) {
				return db.CircleCategoryCrisis
			}
		}
	}

	// Anxiety/Depression category
	anxietyDepKeywords := []string{"anxiety", "anxious", "nervous", "low mood", "depressed", "depression", "sleep"}
	anxietyDepCount := 0
	for _, topic := range topicsLower {
		for _, keyword := range anxietyDepKeywords {
			if strings.Contains(topic, keyword) {
				anxietyDepCount++
				break
			}
		}
	}
	if anxietyDepCount > 0 {
		return db.CircleCategoryAnxietyDepression
	}

	// Academic Stress category
	academicKeywords := []string{"exam", "stress", "motivation", "academic", "study"}
	academicCount := 0
	for _, topic := range topicsLower {
		for _, keyword := range academicKeywords {
			if strings.Contains(topic, keyword) {
				academicCount++
				break
			}
		}
	}
	if academicCount > 0 {
		return db.CircleCategoryAcademicStress
	}

	// Social/Adjustment category
	socialKeywords := []string{"relationship", "social", "adjustment", "college", "friend"}
	socialCount := 0
	for _, topic := range topicsLower {
		for _, keyword := range socialKeywords {
			if strings.Contains(topic, keyword) {
				socialCount++
				break
			}
		}
	}
	if socialCount > 0 {
		return db.CircleCategorySocialAdjustment
	}

	// Default to General Support
	return db.CircleCategoryGeneralSupport
}

// IsCriticalRisk determines if a user requires immediate escalation
func (s *CircleMatchingService) IsCriticalRisk(phq2Total, gad2Total int) bool {
	// Critical if both scores are 5+ OR any score is 6
	return (phq2Total >= 5 && gad2Total >= 5) || phq2Total == 6 || gad2Total == 6
}

// FindOrCreateCircle finds an available circle or creates a new one
func (s *CircleMatchingService) FindOrCreateCircle(ctx context.Context, category db.CircleCategory) (*db.CircleModel, error) {
	// Try to find an active circle with space
	circles, err := s.client.Circle.FindMany(
		db.Circle.Category.Equals(category),
		db.Circle.Status.Equals(db.CircleStatusActive),
	).With(
		db.Circle.Memberships.Fetch(),
	).Exec(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to query circles: %w", err)
	}

	// Find a circle with available space
	for _, circle := range circles {
		memberships := circle.Memberships()
		if len(memberships) < circle.MaxMembers {
			return &circle, nil
		}
	}

	// No available circle found, create a new one
	moderator, err := s.assignModeratorRoundRobin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to assign moderator: %w", err)
	}

	circleName := s.generateCircleName(ctx, category)

	newCircle, err := s.client.Circle.CreateOne(
		db.Circle.Name.Set(circleName),
		db.Circle.Category.Set(category),
		db.Circle.Moderator.Link(db.User.ID.Equals(moderator.ID)),
	).Exec(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to create circle: %w", err)
	}

	log.Printf("Created new circle: %s (Category: %s, Moderator: %s)", newCircle.Name, category, moderator.FullName)

	return newCircle, nil
}

// assignModeratorRoundRobin assigns a moderator using round-robin strategy
func (s *CircleMatchingService) assignModeratorRoundRobin(ctx context.Context) (*db.UserModel, error) {
	// Get all moderators
	moderators, err := s.client.User.FindMany(
		db.User.Role.Equals(db.UserRoleModerator),
	).With(
		db.User.ModeratedCircles.Fetch(),
	).Exec(ctx)

	if err != nil {
		return nil, fmt.Errorf("failed to query moderators: %w", err)
	}

	if len(moderators) == 0 {
		return nil, fmt.Errorf("no moderators available")
	}

	// Find moderator with fewest active circles
	var selectedModerator *db.UserModel
	minCircles := int(^uint(0) >> 1) // Max int

	for i := range moderators {
		circles := moderators[i].ModeratedCircles()
		activeCount := 0
		for _, circle := range circles {
			if circle.Status == db.CircleStatusActive {
				activeCount++
			}
		}
		if activeCount < minCircles {
			minCircles = activeCount
			selectedModerator = &moderators[i]
		}
	}

	return selectedModerator, nil
}

// generateCircleName generates a friendly name for the circle with sequential numbering
func (s *CircleMatchingService) generateCircleName(ctx context.Context, category db.CircleCategory) string {
	prefixes := map[db.CircleCategory]string{
		db.CircleCategoryCrisis:            "Crisis",
		db.CircleCategoryAnxietyDepression: "Mindful",
		db.CircleCategoryAcademicStress:    "Study",
		db.CircleCategorySocialAdjustment:  "Connect",
		db.CircleCategoryGeneralSupport:    "General",
	}

	prefix := prefixes[category]

	// Count existing circles of the same category to get the next number
	existingCircles, err := s.client.Circle.FindMany(
		db.Circle.Category.Equals(category),
	).Exec(ctx)

	circleNumber := 1
	if err == nil {
		circleNumber = len(existingCircles) + 1
	}

	return fmt.Sprintf("%s Circle #%d", prefix, circleNumber)
}

// AddUserToCircle adds a user to a circle
func (s *CircleMatchingService) AddUserToCircle(ctx context.Context, circleID, userID string) error {
	// Check if user is already in a circle
	existingMembership, _ := s.client.CircleMembership.FindFirst(
		db.CircleMembership.UserID.Equals(userID),
	).Exec(ctx)

	if existingMembership != nil {
		return fmt.Errorf("user already in a circle")
	}

	// Add user to circle
	_, err := s.client.CircleMembership.CreateOne(
		db.CircleMembership.Circle.Link(db.Circle.ID.Equals(circleID)),
		db.CircleMembership.User.Link(db.User.ID.Equals(userID)),
	).Exec(ctx)

	if err != nil {
		return fmt.Errorf("failed to add user to circle: %w", err)
	}

	// Check if circle is now full and update status
	circle, err := s.client.Circle.FindUnique(
		db.Circle.ID.Equals(circleID),
	).With(
		db.Circle.Memberships.Fetch(),
	).Exec(ctx)

	if err != nil {
		return err
	}

	memberships := circle.Memberships()
	if len(memberships) >= circle.MaxMembers {
		_, err = s.client.Circle.FindUnique(
			db.Circle.ID.Equals(circleID),
		).Update(
			db.Circle.Status.Set(db.CircleStatusFull),
		).Exec(ctx)
	}

	return err
}

// MatchUserToCircle is the main matching logic
func (s *CircleMatchingService) MatchUserToCircle(ctx context.Context, userID string, topics []string, phq2Total, gad2Total int) (*db.CircleModel, bool, error) {
	// Check if this is a critical risk case
	isCritical := s.IsCriticalRisk(phq2Total, gad2Total)

	if isCritical {
		log.Printf("CRITICAL RISK DETECTED for user %s (PHQ-2: %d, GAD-2: %d)", userID, phq2Total, gad2Total)
		// Don't match to circle, return for escalation
		return nil, true, nil
	}

	// Determine appropriate category
	category := s.DetermineCircleCategory(topics)
	log.Printf("Matching user %s to category: %s", userID, category)

	// Find or create appropriate circle
	circle, err := s.FindOrCreateCircle(ctx, category)
	if err != nil {
		return nil, false, err
	}

	// Add user to circle
	err = s.AddUserToCircle(ctx, circle.ID, userID)
	if err != nil {
		return nil, false, err
	}

	log.Printf("Successfully matched user %s to circle %s", userID, circle.Name)

	return circle, false, nil
}
