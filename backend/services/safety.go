package services

import (
	"regexp"
	"strings"
)

type SafetyCategory string

const (
	SafetyCategorySelfHarm      SafetyCategory = "self_harm"
	SafetyCategoryHarmToOthers  SafetyCategory = "harm_to_others"
	SafetyCategoryDoxxing       SafetyCategory = "doxxing"
	SafetyCategorySubstanceAbuse SafetyCategory = "substance_abuse"
	SafetyCategoryEatingDisorder SafetyCategory = "eating_disorder"
	SafetyCategoryDomesticAbuse SafetyCategory = "domestic_abuse"
	SafetyCategorySexualHarm    SafetyCategory = "sexual_harm"
)

type SafetyMatch struct {
	Category    SafetyCategory
	Severity    string // "critical", "high", "medium"
	MatchedText string
	Start       int
	End         int
}

type SafetyResult struct {
	Flagged       bool
	MaskedContent string
	Matches       []SafetyMatch
	RequiresEscalation bool
}

type SafetyPattern struct {
	Pattern  *regexp.Regexp
	Category SafetyCategory
	Severity string
}

var safetyPatterns = []SafetyPattern{
	// Self-Harm - Critical
	{
		Pattern:  regexp.MustCompile(`(?i)\b(kill\s+(myself|my\s*self)|end\s+(my|this)\s+life|suicid(e|al|ing)|want\s+to\s+die|better\s+off\s+dead|no\s+reason\s+to\s+live)\b`),
		Category: SafetyCategorySelfHarm,
		Severity: "critical",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(self[\s-]?harm|cutting\s+(myself|my)|hurting\s+myself|overdose|od\s+on|take\s+all\s+the\s+(pills|medication))\b`),
		Category: SafetyCategorySelfHarm,
		Severity: "critical",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(plan\s+to\s+(kill|end|hurt)|tonight('s| is)\s+(the|my)\s+(night|last)|saying\s+goodbye|final\s+message)\b`),
		Category: SafetyCategorySelfHarm,
		Severity: "critical",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(razor\s+blade|slit\s+my\s+wrist|hang\s+myself|jump\s+off|bridge\s+and\s+(jump|leap))\b`),
		Category: SafetyCategorySelfHarm,
		Severity: "critical",
	},

	// Self-Harm - High
	{
		Pattern:  regexp.MustCompile(`(?i)\b(not\s+worth\s+living|can'?t\s+go\s+on|wish\s+I\s+(was|were)\s+dead|everyone\s+would\s+be\s+better\s+without\s+me)\b`),
		Category: SafetyCategorySelfHarm,
		Severity: "high",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(self[\s-]?destruct|burn\s+myself|scratch(ing)?\s+until|pick\s+at\s+my\s+skin)\b`),
		Category: SafetyCategorySelfHarm,
		Severity: "high",
	},

	// Harm to Others - Critical
	{
		Pattern:  regexp.MustCompile(`(?i)\b(kill\s+(him|her|them|someone|everybody|everyone)|murder|shoot\s+up\s+the|bomb\s+the)\b`),
		Category: SafetyCategoryHarmToOthers,
		Severity: "critical",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(stab\s+(him|her|them)|got\s+(my|a|the)\s+gun|bring\s+(my|a|the)\s+(gun|weapon|knife))\b`),
		Category: SafetyCategoryHarmToOthers,
		Severity: "critical",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(deserve\s+to\s+die|make\s+(him|her|them)\s+(pay|suffer|regret)|get\s+revenge|they('ll| will)\s+regret)\b`),
		Category: SafetyCategoryHarmToOthers,
		Severity: "critical",
	},

	// Harm to Others - High
	{
		Pattern:  regexp.MustCompile(`(?i)\b(beat\s+(him|her|them)\s+up|fight\s+(him|her|them)|gonna\s+hurt|plan\s+to\s+attack)\b`),
		Category: SafetyCategoryHarmToOthers,
		Severity: "high",
	},

	// Doxxing - Critical
	{
		Pattern:  regexp.MustCompile(`(?i)\b(my\s+address\s+is|live\s+at\s+\d+|password\s+is|social\s+security|ssn\s+is)\b`),
		Category: SafetyCategoryDoxxing,
		Severity: "critical",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(phone\s+number\s+is\s+\d|call\s+me\s+at\s+\d|credit\s+card|bank\s+account\s+number)\b`),
		Category: SafetyCategoryDoxxing,
		Severity: "critical",
	},
	{
		Pattern:  regexp.MustCompile(`\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b`), // SSN pattern
		Category: SafetyCategoryDoxxing,
		Severity: "critical",
	},
	{
		Pattern:  regexp.MustCompile(`\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b`), // Credit card pattern
		Category: SafetyCategoryDoxxing,
		Severity: "critical",
	},

	// Substance Abuse - Critical
	{
		Pattern:  regexp.MustCompile(`(?i)\b(overdos(e|ing)|od('d| on)|mix(ing)?\s+(pills|drugs|alcohol)\s+and|take\s+all\s+my)\b`),
		Category: SafetyCategorySubstanceAbuse,
		Severity: "critical",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(shoot(ing)?\s+up|inject(ing)?\s+(heroin|meth)|snort(ing)?\s+(coke|cocaine)|smoke\s+(meth|crack))\b`),
		Category: SafetyCategorySubstanceAbuse,
		Severity: "critical",
	},

	// Substance Abuse - High
	{
		Pattern:  regexp.MustCompile(`(?i)\b(binge\s+drink(ing)?|blackout\s+drunk|alcohol\s+poisoning|too\s+many\s+pills)\b`),
		Category: SafetyCategorySubstanceAbuse,
		Severity: "high",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(relaps(ed|ing)|using\s+again|back\s+on\s+(drugs|pills|alcohol)|can'?t\s+stop\s+(drinking|using))\b`),
		Category: SafetyCategorySubstanceAbuse,
		Severity: "high",
	},

	// Eating Disorder - High
	{
		Pattern:  regexp.MustCompile(`(?i)\b(starv(e|ing)\s+(myself|to\s+death)|not\s+eat(ing)?\s+for\s+days|purge|making?\s+myself\s+(throw\s+up|vomit))\b`),
		Category: SafetyCategoryEatingDisorder,
		Severity: "high",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(laxative\s+abuse|eat\s+and\s+purge|bulimic|anorexic|restrict(ing)?\s+to\s+\d+\s+calorie)\b`),
		Category: SafetyCategoryEatingDisorder,
		Severity: "high",
	},

	// Domestic Abuse - Critical
	{
		Pattern:  regexp.MustCompile(`(?i)\b((he|she|they)\s+(hit|beat|choke|strangle)(s|d)?\s+me|being\s+physically\s+abused|afraid\s+(he|she|they)('ll| will)\s+(kill|hurt)\s+me)\b`),
		Category: SafetyCategoryDomesticAbuse,
		Severity: "critical",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(won'?t\s+let\s+me\s+leave|locked\s+me\s+in|threatens\s+to\s+kill|gun\s+to\s+my\s+head)\b`),
		Category: SafetyCategoryDomesticAbuse,
		Severity: "critical",
	},

	// Domestic Abuse - High
	{
		Pattern:  regexp.MustCompile(`(?i)\b(controls?\s+(everything|my\s+money|where\s+I\s+go)|isolat(ed|ing)\s+me\s+from|afraid\s+of\s+(my|the)\s+(partner|boyfriend|girlfriend|husband|wife))\b`),
		Category: SafetyCategoryDomesticAbuse,
		Severity: "high",
	},

	// Sexual Harm - Critical
	{
		Pattern:  regexp.MustCompile(`(?i)\b((he|she|they)\s+(raped|molested|assaulted)\s+me|forced\s+me\s+to|non[\s-]?consensual|didn'?t\s+consent)\b`),
		Category: SafetyCategorySexualHarm,
		Severity: "critical",
	},
	{
		Pattern:  regexp.MustCompile(`(?i)\b(sexual\s+assault|sexually\s+abused|touched\s+me\s+inappropriately|when\s+I\s+said\s+no)\b`),
		Category: SafetyCategorySexualHarm,
		Severity: "critical",
	},
}

type SafetyService struct{}

func NewSafetyService() *SafetyService {
	return &SafetyService{}
}

type matchPos struct {
	start    int
	end      int
	category SafetyCategory
	severity string
}

// CheckContent analyzes content for safety concerns and returns masked version
func (s *SafetyService) CheckContent(content string) SafetyResult {
	result := SafetyResult{
		Flagged:       false,
		MaskedContent: content,
		Matches:       []SafetyMatch{},
		RequiresEscalation: false,
	}

	if strings.TrimSpace(content) == "" {
		return result
	}

	// Track all match positions for masking
	var matches []matchPos

	// Check all patterns
	for _, pattern := range safetyPatterns {
		allMatches := pattern.Pattern.FindAllStringIndex(content, -1)
		for _, match := range allMatches {
			result.Flagged = true

			// Check if this is critical severity - requires escalation
			if pattern.Severity == "critical" {
				result.RequiresEscalation = true
			}

			matchText := content[match[0]:match[1]]
			result.Matches = append(result.Matches, SafetyMatch{
				Category:    pattern.Category,
				Severity:    pattern.Severity,
				MatchedText: matchText,
				Start:       match[0],
				End:         match[1],
			})

			matches = append(matches, matchPos{
				start:    match[0],
				end:      match[1],
				category: pattern.Category,
				severity: pattern.Severity,
			})
		}
	}

	// Mask content if flagged
	if result.Flagged {
		result.MaskedContent = s.maskContent(content, matches)
	}

	return result
}

// maskContent replaces sensitive content with masking characters
func (s *SafetyService) maskContent(content string, matches []matchPos) string {
	if len(matches) == 0 {
		return content
	}

	// Sort matches by start position (descending) to replace from end to start
	// This prevents position shifting issues
	for i := 0; i < len(matches); i++ {
		for j := i + 1; j < len(matches); j++ {
			if matches[j].start > matches[i].start {
				matches[i], matches[j] = matches[j], matches[i]
			}
		}
	}

	// Merge overlapping ranges
	merged := []matchPos{matches[0]}
	for i := 1; i < len(matches); i++ {
		current := matches[i]
		last := &merged[len(merged)-1]

		// If overlapping or adjacent, merge
		if current.end >= last.start {
			if current.start < last.start {
				last.start = current.start
			}
			if current.end > last.end {
				last.end = current.end
			}
			// Keep higher severity
			if current.severity == "critical" {
				last.severity = "critical"
			}
		} else {
			merged = append(merged, current)
		}
	}

	// Apply masking from end to start
	runes := []rune(content)
	for _, match := range merged {
		maskLength := match.end - match.start
		mask := strings.Repeat("▮", maskLength)
		runes = append(runes[:match.start], append([]rune(mask), runes[match.end:]...)...)
	}

	return string(runes)
}

// GetCategoryDescription returns a human-readable description of the safety category
func GetCategoryDescription(category SafetyCategory) string {
	switch category {
	case SafetyCategorySelfHarm:
		return "Self-harm or suicidal ideation"
	case SafetyCategoryHarmToOthers:
		return "Threats of harm to others"
	case SafetyCategoryDoxxing:
		return "Personal information disclosure"
	case SafetyCategorySubstanceAbuse:
		return "Substance abuse concern"
	case SafetyCategoryEatingDisorder:
		return "Eating disorder behavior"
	case SafetyCategoryDomesticAbuse:
		return "Domestic violence"
	case SafetyCategorySexualHarm:
		return "Sexual assault or abuse"
	default:
		return "Safety concern"
	}
}
