package services

import (
	"fmt"
	"log"
	"net/smtp"
	"os"
	"strings"
)

type EmailService struct {
	from     string
	password string
	smtpHost string
	smtpPort string
}

func NewEmailService() *EmailService {
	return &EmailService{
		from:     os.Getenv("SMTP_FROM"),
		password: os.Getenv("SMTP_PASSWORD"),
		smtpHost: os.Getenv("SMTP_HOST"),
		smtpPort: os.Getenv("SMTP_PORT"),
	}
}

// SendCriticalRiskAlert sends an email alert for users with critical risk scores
func (s *EmailService) SendCriticalRiskAlert(userName, userEmail string, phq2Total, gad2Total int, topics []string) error {
	// For now, send to hardcoded escalation email
	escalationEmail := "atzgg132@gmail.com"

	subject := fmt.Sprintf("⚠️ URGENT: High-Risk User Alert - %s", userName)

	body := fmt.Sprintf(`
CRITICAL RISK ALERT
===================

A user has completed onboarding with concerning screening scores that require immediate attention.

User Information:
-----------------
Name: %s
Email: %s

Screening Scores:
-----------------
PHQ-2 Total: %d/6
GAD-2 Total: %d/6

Topics of Concern:
-----------------
%s

Risk Assessment:
-----------------
This user's scores indicate a need for immediate professional support. The user has been:
✓ Provided with crisis resources
✓ Directed to helplines
✓ Temporarily paused from circle matching

Recommended Actions:
-------------------
1. Review the user's responses as soon as possible
2. Consider reaching out directly if contact permission was granted
3. Ensure appropriate professional resources are available
4. Monitor for any follow-up engagement

This is an automated alert from the MindBridge platform.
For questions, contact the platform administrator.
	`, userName, userEmail, phq2Total, gad2Total, strings.Join(topics, ", "))

	return s.sendEmail(escalationEmail, subject, body)
}

// SendCircleMatchNotification sends an email when a user is matched to a circle
func (s *EmailService) SendCircleMatchNotification(userName, userEmail, circleName, moderatorName string) error {
	subject := fmt.Sprintf("Welcome to %s! 🎉", circleName)

	body := fmt.Sprintf(`
Hi %s,

Great news! You've been matched to a support circle.

Your Circle: %s
Moderator: %s

What's Next?
-----------
• Head to your dashboard to connect with your circle
• Introduce yourself when you're ready
• Remember: this is a safe, supportive space

Guidelines:
----------
• Be respectful and compassionate
• Keep conversations confidential
• Speak from your own experience
• The moderator is here to support you

Log in to get started: http://localhost:5173/dashboard

Warm regards,
The MindBridge Team
	`, userName, circleName, moderatorName)

	return s.sendEmail(userEmail, subject, body)
}

// sendEmail sends an email using SMTP
func (s *EmailService) sendEmail(to, subject, body string) error {
	// If SMTP is not configured, just log the email
	if s.from == "" || s.smtpHost == "" {
		log.Printf("EMAIL (SMTP not configured):\nTo: %s\nSubject: %s\n%s\n", to, subject, body)
		return nil
	}

	auth := smtp.PlainAuth("", s.from, s.password, s.smtpHost)

	message := []byte(fmt.Sprintf("To: %s\r\nSubject: %s\r\n\r\n%s", to, subject, body))

	addr := fmt.Sprintf("%s:%s", s.smtpHost, s.smtpPort)

	err := smtp.SendMail(addr, auth, s.from, []string{to}, message)
	if err != nil {
		log.Printf("Failed to send email: %v", err)
		return err
	}

	log.Printf("Email sent successfully to %s", to)
	return nil
}
