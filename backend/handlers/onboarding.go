package handlers

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"mindbridge/backend/prisma/db"
	"mindbridge/backend/services"
	"mindbridge/backend/utils"
)

type OnboardingHandler struct {
	client          *db.PrismaClient
	matchingService *services.CircleMatchingService
	emailService    *services.EmailService
}

func NewOnboardingHandler(client *db.PrismaClient) *OnboardingHandler {
	return &OnboardingHandler{
		client:          client,
		matchingService: services.NewCircleMatchingService(client),
		emailService:    services.NewEmailService(),
	}
}

type wellbeingAnswers struct {
	LittleInterest int `json:"littleInterest"`
	FeelingDown    int `json:"feelingDown"`
	FeelingNervous int `json:"feelingNervous"`
	Worrying       int `json:"worrying"`
}

type OnboardingRequest struct {
	Topics             []string         `json:"topics"`
	OtherTopic         string           `json:"otherTopic"`
	ParticipationStyle string           `json:"participationStyle"`
	Availability       string           `json:"availability"`
	Wellbeing          wellbeingAnswers `json:"wellbeing"`
	ConsentAccepted    bool             `json:"consentAccepted"`
	ConsentVersion     string           `json:"consentVersion"`
	ContactOk          *bool            `json:"contactOk"`
}

type OnboardingResponsePayload struct {
	Topics             []string         `json:"topics"`
	OtherTopic         string           `json:"otherTopic,omitempty"`
	ParticipationStyle string           `json:"participationStyle"`
	Availability       string           `json:"availability"`
	Wellbeing          wellbeingAnswers `json:"wellbeing"`
	Phq2Total          int              `json:"phq2Total"`
	Gad2Total          int              `json:"gad2Total"`
	ScreeningResult    string           `json:"screeningResult"`
	ConsentVersion     string           `json:"consentVersion"`
	ContactOk          bool             `json:"contactOk"`
	OnboardingDone     bool             `json:"onboardingDone"`
}

var (
	allowedTopics = map[string]struct{}{
		"Exam stress":           {},
		"Anxiety":               {},
		"Low mood":              {},
		"Motivation":            {},
		"Sleep issues":          {},
		"Relationship stress":   {},
		"Adjustment to college": {},
		"Other":                 {},
	}
	participationOptions = map[string]struct{}{
		"Mostly listen":       {},
		"Share & get support": {},
		"Learn coping tools":  {},
		"Not sure yet":        {},
	}
	availabilityOptions = map[string]struct{}{
		"Morning":   {},
		"Afternoon": {},
		"Evening":   {},
	}
)

// GetOnboarding returns existing onboarding data for the authenticated user.
func (h *OnboardingHandler) GetOnboarding(c *gin.Context) {
	role, _ := c.Get("role")
	if role == "MODERATOR" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Moderators do not require onboarding"})
		return
	}

	userIDValue, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	userID := userIDValue.(string)
	ctx := context.Background()

	user, err := h.client.User.FindUnique(
		db.User.ID.Equals(userID),
	).With(
		db.User.OnboardingResponse.Fetch(),
	).Exec(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load user"})
		return
	}

	onboardingRecord, ok := user.OnboardingResponse()
	if !ok || onboardingRecord == nil {
		c.JSON(http.StatusOK, gin.H{
			"data": nil,
		})
		return
	}

	otherTopicValue := ""
	if value, present := onboardingRecord.OtherTopic(); present {
		otherTopicValue = string(value)
	}

	payload := OnboardingResponsePayload{
		Topics:             onboardingRecord.Topics,
		OtherTopic:         otherTopicValue,
		ParticipationStyle: onboardingRecord.ParticipationStyle,
		Availability:       onboardingRecord.Availability,
		Wellbeing: wellbeingAnswers{
			LittleInterest: onboardingRecord.LittleInterest,
			FeelingDown:    onboardingRecord.FeelingDown,
			FeelingNervous: onboardingRecord.FeelingNervous,
			Worrying:       onboardingRecord.Worrying,
		},
		Phq2Total:       onboardingRecord.Phq2Total,
		Gad2Total:       onboardingRecord.Gad2Total,
		ScreeningResult: strings.ToLower(string(onboardingRecord.ScreeningResult)),
		ConsentVersion:  onboardingRecord.ConsentVersion,
		ContactOk:       onboardingRecord.ContactOk,
		OnboardingDone:  user.OnboardingCompleted,
	}

	c.JSON(http.StatusOK, gin.H{
		"data": payload,
	})
}

// SubmitOnboarding handles creation or update of onboarding responses.
func (h *OnboardingHandler) SubmitOnboarding(c *gin.Context) {
	role, _ := c.Get("role")
	if role == "MODERATOR" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Moderators do not require onboarding"})
		return
	}

	var req OnboardingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
		return
	}

	if validationErr := validateOnboardingRequest(req); validationErr != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": validationErr})
		return
	}

	userIDValue, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	userID := userIDValue.(string)
	ctx := context.Background()

	phq2Total := req.Wellbeing.LittleInterest + req.Wellbeing.FeelingDown
	gad2Total := req.Wellbeing.FeelingNervous + req.Wellbeing.Worrying
	screeningLevel := computeScreeningLevel(phq2Total, gad2Total)

	now := time.Now().UTC()
	contactOK := true
	if req.ContactOk != nil {
		contactOK = *req.ContactOk
	}

	topics := dedupeAndTrimTopics(req.Topics)
	otherTopic := strings.TrimSpace(req.OtherTopic)
	hasOther := containsOther(topics)
	consentAcceptedAt := db.DateTime(now)

	var prismaOtherTopic *db.String
	if hasOther && otherTopic != "" {
		tmp := db.String(otherTopic)
		prismaOtherTopic = &tmp
	}

	baseParams := []db.OnboardingResponseSetParam{
		db.OnboardingResponse.Topics.Set(topics),
		db.OnboardingResponse.OtherTopic.SetOptional(prismaOtherTopic),
		db.OnboardingResponse.ContactOk.Set(contactOK),
	}

	_, err := h.client.OnboardingResponse.FindUnique(
		db.OnboardingResponse.UserID.Equals(userID),
	).Exec(ctx)

	switch {
	case errors.Is(err, db.ErrNotFound):
		_, createErr := h.client.OnboardingResponse.CreateOne(
			db.OnboardingResponse.User.Link(
				db.User.ID.Equals(userID),
			),
			db.OnboardingResponse.ParticipationStyle.Set(req.ParticipationStyle),
			db.OnboardingResponse.Availability.Set(req.Availability),
			db.OnboardingResponse.LittleInterest.Set(req.Wellbeing.LittleInterest),
			db.OnboardingResponse.FeelingDown.Set(req.Wellbeing.FeelingDown),
			db.OnboardingResponse.FeelingNervous.Set(req.Wellbeing.FeelingNervous),
			db.OnboardingResponse.Worrying.Set(req.Wellbeing.Worrying),
			db.OnboardingResponse.Phq2Total.Set(phq2Total),
			db.OnboardingResponse.Gad2Total.Set(gad2Total),
			db.OnboardingResponse.ScreeningResult.Set(screeningLevel),
			db.OnboardingResponse.ConsentVersion.Set(req.ConsentVersion),
			db.OnboardingResponse.ConsentAcceptedAt.Set(consentAcceptedAt),
			baseParams...,
		).Exec(ctx)
		if createErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save onboarding data"})
			return
		}
	case err != nil:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save onboarding data"})
		return
	default:
		updateParams := []db.OnboardingResponseSetParam{
			db.OnboardingResponse.ParticipationStyle.Set(req.ParticipationStyle),
			db.OnboardingResponse.Availability.Set(req.Availability),
			db.OnboardingResponse.LittleInterest.Set(req.Wellbeing.LittleInterest),
			db.OnboardingResponse.FeelingDown.Set(req.Wellbeing.FeelingDown),
			db.OnboardingResponse.FeelingNervous.Set(req.Wellbeing.FeelingNervous),
			db.OnboardingResponse.Worrying.Set(req.Wellbeing.Worrying),
			db.OnboardingResponse.Phq2Total.Set(phq2Total),
			db.OnboardingResponse.Gad2Total.Set(gad2Total),
			db.OnboardingResponse.ScreeningResult.Set(screeningLevel),
			db.OnboardingResponse.ConsentVersion.Set(req.ConsentVersion),
			db.OnboardingResponse.ConsentAcceptedAt.Set(consentAcceptedAt),
		}
		updateParams = append(updateParams, baseParams...)

		_, updateErr := h.client.OnboardingResponse.FindUnique(
			db.OnboardingResponse.UserID.Equals(userID),
		).Update(updateParams...).Exec(ctx)
		if updateErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update onboarding data"})
			return
		}
	}

	// Mark user as onboarded
	user, err := h.client.User.FindUnique(
		db.User.ID.Equals(userID),
	).Update(
		db.User.OnboardingCompleted.Set(true),
	).Exec(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user status"})
		return
	}

	// Perform circle matching
	circle, isCritical, matchErr := h.matchingService.MatchUserToCircle(ctx, userID, topics, phq2Total, gad2Total)

	if isCritical {
		// Send escalation email for critical risk
		log.Printf("Sending critical risk alert for user %s", userID)
		go h.emailService.SendCriticalRiskAlert(user.FullName, user.Email, phq2Total, gad2Total, topics)
		// Don't fail the request if email fails
	} else if matchErr != nil {
		log.Printf("Circle matching failed for user %s: %v", userID, matchErr)
		// Continue anyway - user can be matched manually later
	} else if circle != nil {
		// Successfully matched - send notification email
		log.Printf("User %s matched to circle %s", userID, circle.Name)

		moderator, err := h.client.User.FindUnique(
			db.User.ID.Equals(circle.ModeratorID),
		).Exec(ctx)

		if err == nil {
			go h.emailService.SendCircleMatchNotification(user.FullName, user.Email, circle.Name, moderator.FullName)
		}
	}

	responseOtherTopic := ""
	if hasOther && otherTopic != "" {
		responseOtherTopic = otherTopic
	}

	// Generate new JWT token with onboarding_completed: true
	emailValue, _ := c.Get("email")
	roleValue, _ := c.Get("role")
	newToken, err := utils.GenerateJWT(userID, emailValue.(string), roleValue.(string), true)
	if err != nil {
		log.Printf("Failed to generate new JWT for user %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate authentication token"})
		return
	}

	payload := OnboardingResponsePayload{
		Topics:             topics,
		OtherTopic:         responseOtherTopic,
		ParticipationStyle: req.ParticipationStyle,
		Availability:       req.Availability,
		Wellbeing: wellbeingAnswers{
			LittleInterest: req.Wellbeing.LittleInterest,
			FeelingDown:    req.Wellbeing.FeelingDown,
			FeelingNervous: req.Wellbeing.FeelingNervous,
			Worrying:       req.Wellbeing.Worrying,
		},
		Phq2Total:       phq2Total,
		Gad2Total:       gad2Total,
		ScreeningResult: strings.ToLower(string(screeningLevel)),
		ConsentVersion:  req.ConsentVersion,
		ContactOk:       contactOK,
		OnboardingDone:  true,
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  payload,
		"token": newToken,
	})
}

func validateOnboardingRequest(req OnboardingRequest) string {
	if len(req.Topics) == 0 {
		return "Please complete this field."
	}

	hasValidTopic := false
	for _, topic := range req.Topics {
		topic = strings.TrimSpace(topic)
		if topic == "" {
			continue
		}
		if _, ok := allowedTopics[topic]; ok {
			hasValidTopic = true
		} else {
			return "Please complete this field."
		}
	}
	if !hasValidTopic {
		return "Please complete this field."
	}

	if _, ok := participationOptions[req.ParticipationStyle]; !ok {
		return "Please complete this field."
	}

	if _, ok := availabilityOptions[req.Availability]; !ok {
		return "Please complete this field."
	}

	if !isValidScaleValue(req.Wellbeing.LittleInterest) ||
		!isValidScaleValue(req.Wellbeing.FeelingDown) ||
		!isValidScaleValue(req.Wellbeing.FeelingNervous) ||
		!isValidScaleValue(req.Wellbeing.Worrying) {
		return "Please complete this field."
	}

	if !req.ConsentAccepted {
		return "You need to accept to continue."
	}

	if strings.TrimSpace(req.ConsentVersion) == "" {
		return "Please complete this field."
	}

	return ""
}

func isValidScaleValue(value int) bool {
	return value >= 0 && value <= 3
}

func computeScreeningLevel(phq2, gad2 int) db.ScreeningLevel {
	maxScore := phq2
	if gad2 > maxScore {
		maxScore = gad2
	}

	switch {
	case maxScore >= 5:
		return db.ScreeningLevelHigh
	case maxScore >= 3:
		return db.ScreeningLevelMedium
	default:
		return db.ScreeningLevelLow
	}
}

func dedupeAndTrimTopics(input []string) []string {
	seen := make(map[string]struct{})
	result := make([]string, 0, len(input))

	for _, item := range input {
		clean := strings.TrimSpace(item)
		if clean == "" {
			continue
		}
		if _, ok := allowedTopics[clean]; !ok {
			continue
		}
		if _, exists := seen[clean]; exists {
			continue
		}
		seen[clean] = struct{}{}
		result = append(result, clean)
	}

	return result
}

func containsOther(topics []string) bool {
	for _, topic := range topics {
		if topic == "Other" {
			return true
		}
	}
	return false
}
