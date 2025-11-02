# MindBridge Authentication System

## Overview

The MindBridge authentication system supports two types of users:
- **Users** - Regular users who go through signup, onboarding, and screening
- **Moderators** - Manually created users who moderate peer circles

## Features Implemented

### Backend (Go + Gin)

#### Database Schema
- User model with:
  - `id` (UUID)
  - `email` (unique)
  - `fullName`
  - `phoneNumber`
  - `password` (hashed with bcrypt)
  - `profilePicture` (optional)
  - `role` (USER or MODERATOR)
  - `onboardingCompleted` (boolean, default: false)
  - `createdAt` and `updatedAt` timestamps

#### API Endpoints
- `POST /api/auth/signup` - User registration (users only)
- `POST /api/auth/signin` - Login (both users and moderators)
- `GET /api/auth/check-email?email=` - Check email availability
- `GET /api/auth/me` - Get current user (protected)

#### Security Features
- Password hashing with bcrypt
- JWT authentication (7-day expiry)
- Password strength validation (8+ chars, uppercase, lowercase, number, special char)
- Email format validation
- Protected routes with middleware

### Frontend (React + TypeScript)

#### Pages
1. **Home** (`/`) - Landing page
2. **Signup** (`/signup`) - User registration with:
   - Real-time email availability check
   - Real-time password strength indicator
   - Animated transitions
   - Form validation
3. **Signin** (`/signin`) - Login for users and moderators
4. **Dashboard** (`/dashboard`) - Protected dashboard
5. **Onboarding** (`/onboarding`) - Placeholder for onboarding flow

#### Features
- ✨ Smooth, seamless animations using Framer Motion
- 🔒 Protected routes with authentication
- 📧 Real-time email availability check (debounced)
- 🔑 Real-time password strength validation
- 🎨 Responsive design with Tailwind CSS v4
- 🔄 Auto-redirect based on:
  - Authentication status
  - User role (USER vs MODERATOR)
  - Onboarding completion status

#### User Flow

**For Regular Users:**
1. Signup → Onboarding → Dashboard
2. If user logs out before onboarding, they'll see onboarding on next login

**For Moderators:**
1. Signin → Dashboard (no onboarding required)
2. Can manage multiple circles

## Testing the Auth Flow

### 1. Create a Regular User

Visit http://localhost:5173/signup and create an account:
- Full Name: Test User
- Email: test@example.com
- Phone: 1234567890
- Password: Test@123

The password strength indicator will show real-time feedback. Once you create the account, you'll be redirected to the onboarding page.

### 2. Create a Moderator (Manual)

Connect to the database and create a moderator:

```bash
# Access Prisma Studio
cd backend
go run github.com/steebchen/prisma-client-go studio
```

Or using SQL:

```sql
INSERT INTO users (id, email, "fullName", "phoneNumber", password, role, "onboardingCompleted")
VALUES (
  gen_random_uuid(),
  'moderator@mindbridge.com',
  'Test Moderator',
  '9876543210',
  '$2a$10$[bcrypt_hash]',  -- Use a hashed password
  'MODERATOR',
  true
);
```

To generate a password hash, you can use this Go snippet:

```go
package main
import (
    "fmt"
    "golang.org/x/crypto/bcrypt"
)
func main() {
    hash, _ := bcrypt.GenerateFromPassword([]byte("Moderator@123"), bcrypt.DefaultCost)
    fmt.Println(string(hash))
}
```

### 3. Test Signin

Visit http://localhost:5173/signin and login with either account.

- **User** without onboarding → redirected to `/onboarding`
- **User** with onboarding → redirected to `/dashboard`
- **Moderator** → redirected to `/dashboard`

## Password Requirements

For security, passwords must include:
- ✓ At least 8 characters
- ✓ At least one uppercase letter
- ✓ At least one lowercase letter
- ✓ At least one number
- ✓ At least one special character (!@#$%^&*)

## State Management

Using Zustand for auth state:
- Persisted in localStorage
- Includes: user object, JWT token, authentication status
- Auto-loads on page refresh
- Cleared on logout

## Protected Routes

The `ProtectedRoute` component:
1. Checks authentication status
2. Verifies JWT token validity
3. Fetches user data if needed
4. Shows loading spinner during verification
5. Redirects to signin if unauthenticated

## UI/UX Features

### Animations
- Page transitions (fade + slide)
- Form field animations
- Button hover/tap effects
- Loading spinners
- Success/error message transitions
- Password strength bar animation

### Real-time Validation
- Email availability (500ms debounce)
- Password strength meter
- Instant feedback on errors
- Visual indicators (checkmarks, warnings)

## Security Notes

1. **Passwords**: Never stored in plain text, always bcrypt hashed
2. **JWT**: Stored in localStorage and axios interceptor
3. **Token Expiry**: 7 days, auto-refresh on protected route access
4. **CORS**: Configured for localhost:5173
5. **SQL Injection**: Protected by Prisma ORM
6. **XSS**: React automatically escapes output

## API Response Format

**Signup/Signin Success:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "phoneNumber": "1234567890",
    "profilePicture": null,
    "role": "USER",
    "onboardingCompleted": false
  }
}
```

**Error Response:**
```json
{
  "error": "Email already registered"
}
```

## Future Enhancements

- [ ] Implement actual onboarding flow
- [ ] Implement screening questionnaire
- [ ] Add circle matching algorithm
- [ ] Profile picture upload with file storage
- [ ] Email verification
- [ ] Password reset flow
- [ ] Two-factor authentication
- [ ] Session management
- [ ] Audit logs

## Development

Both servers should be running:
- Backend: http://localhost:8080
- Frontend: http://localhost:5173

Check backend logs for API requests and any errors.
