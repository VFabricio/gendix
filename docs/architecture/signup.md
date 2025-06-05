# Signup Flow Architecture

This document describes the architecture for the user signup flow, which involves concurrent database operations and asynchronous email processing.

## Overview

The signup process is designed to handle user registration with transactional integrity and reliable email delivery through an event-driven architecture.

## Architecture Diagram

```mermaid
sequenceDiagram
    participant User
    participant API
    participant Database
    participant SQS
    participant Worker
    participant EmailService

    User->>API: POST /api/signup
    
    API->>API: Validate signup data
    API->>API: Generate random magic code
    
    alt Validation successful
        API->>Database: Begin transaction
        
        par Store signup data and send event
            API->>Database: Store user data + hashed magic code
        and
            API->>SQS: Send signup event (with magic code)
        end
        
        alt SQS send successful
            API->>Database: Commit transaction
            API->>User: 200 OK - Success response
        else SQS send failed
            API->>Database: Rollback transaction
            API->>User: 500 Error - Unable to process signup
        end
        
        SQS->>Worker: Deliver signup event

        Worker->>Database: Begin transaction
        
        Worker->>EmailService: Send confirmation email with magic code link
        Note over EmailService: Email contains link: /confirm-signup?email=<email>&code=<magic_code>
        
        alt Email sent successfully
            Worker->>Database: Update user state (email sent)
            Worker->>SQS: Delete message from queue
            alt SQS delete successful
                Worker->>Database: Commit transaction
            else SQS delete failed
                Worker->>Database: Rollback transaction
            end
        else Email send failed
            Worker->>Database: Rollback transaction
            Note over Worker: Message remains in SQS for retry
        end
        
    else Validation failed
        API->>User: 400 Bad Request - Validation errors
    end

    rect rgb(240, 248, 255)
        Note over User, API: Email Confirmation Flow
        
        User->>API: GET /confirm-signup?email=<email>&code=<magic_code>
        
        API->>Database: Verify magic code hash matches user
        
        alt Magic code valid
            API->>Database: Update user status to 'confirmed'
            API->>User: 302 Redirect to /signup-confirmation?success=true
        else Magic code invalid
            API->>User: 302 Redirect to /signup-confirmation?success=false
        end
        
        User->>API: GET /signup-confirmation?success=true/false
        
        alt success=true
            API->>User: Display success page with sign-in button
        else success=false
            API->>User: Display error page with support contact
        end
    end
```

## Key Components

### Backend API
- Validates incoming signup requests
- Manages database transactions
- Publishes events to SQS concurrently with database operations
- Ensures transactional integrity by rolling back on SQS failures

### Database
- Stores user signup data
- Maintains user state (pending email confirmation, confirmed, etc.)
- Supports transactions for data consistency

### SQS (Simple Queue Service)
- Receives signup events from the backend
- Provides reliable message delivery to workers
- Handles message retry logic for failed processing

### Worker
- Processes signup events from SQS
- Sends confirmation emails to users
- Updates user state in database upon successful email delivery
- Deletes processed messages from SQS

### Email Service
- Handles actual email delivery
- Includes magic code confirmation link in email content
- Returns success/failure status to worker

## API Endpoints

### POST /api/signup
- Validates signup data (individual or business)
- Generates random magic code
- Stores user data and hashed magic code in database
- Sends signup event to SQS queue
- Returns success/error response

### GET /confirm-signup?email=&lt;email&gt;&code=&lt;magic_code&gt;
- Validates magic code against stored hash for the given email
- Updates user status to 'confirmed' if valid
- Redirects to signup-confirmation page with success/failure status

### GET /signup-confirmation?success=true/false
- **success=true**: Displays confirmation success message with sign-in button
- **success=false**: Displays error message asking user to check email link or contact support

## Email Confirmation Flow

1. **Magic Code Generation**: API generates cryptographically secure random code
2. **Code Storage**: Hash of magic code is stored in database (never plain text)
3. **Email Content**: Confirmation email contains link: `/confirm-signup?email=<email>&code=<magic_code>`
4. **Code Verification**: When user clicks link, API hashes provided code and compares with stored hash
5. **Status Update**: Valid codes trigger user status change to 'confirmed'
6. **User Feedback**: User is redirected to appropriate success/error page

## Error Handling

1. **Validation Errors**: Return 400 Bad Request immediately
2. **SQS Failures**: Rollback database transaction and return 500 error
3. **Email Failures**: Leave message in SQS for automatic retry, do not update user state
4. **Invalid Magic Code**: Redirect to error page with instructions to check email link
5. **Expired/Missing Codes**: Treated as invalid codes

## Database Schema

The following ER diagram illustrates the user tables that support the signup flow:

```mermaid
erDiagram
    USERS {
        uuid id PK
        varchar email UK "Unique email address"
        varchar password_hash "Hashed password"
        varchar magic_code_hash "Hashed magic code for email confirmation"
        enum account_type "individual or business"
        enum status "pending_email, email_sent, confirmed, failed"
        timestamp created_at
        timestamp updated_at
        timestamp email_sent_at "When confirmation email was sent"
        timestamp confirmed_at "When user confirmed email"
    }
    
    INDIVIDUALS {
        uuid id PK
        uuid user_id FK "References USERS.id"
        varchar first_name "Individual's first name"
        varchar last_name "Individual's last name"
        varchar cpf "Brazilian tax ID for individuals"
        timestamp created_at
        timestamp updated_at
    }
    
    BUSINESSES {
        uuid id PK
        uuid user_id FK "References USERS.id"
        varchar company_name "Legal company name"
        varchar cnpj "Brazilian tax ID for businesses"
        timestamp created_at
        timestamp updated_at
    }
    
    USERS ||--o| INDIVIDUALS : "has (if individual)"
    USERS ||--o| BUSINESSES : "has (if business)"
```

### Status Column Values

- **pending_email**: User registered, waiting for email to be sent
- **email_sent**: Confirmation email has been sent to user
- **confirmed**: User has confirmed their email address
- **failed**: Email sending failed (for monitoring/retry purposes)

### Table Relationships

- Each user can have either an individual profile OR a business profile (not both)
- The `account_type` field in USERS determines which related table contains the profile data
- Individual accounts link to the INDIVIDUALS table with personal information
- Business accounts link to the BUSINESSES table with company information
- Status tracking enables the worker to update user state after successful email delivery

## Transactional Integrity

The system ensures that either both the database write and SQS event succeed, or both fail. This prevents inconsistent states where user data is stored but no email confirmation process is triggered.
