#!/bin/bash
# Secret Scanner - Prevents committing secrets to repository
# Exit code 1 if secrets found, 0 if clean

set -e

echo "🔍 Scanning repository for secrets..."

ERRORS=0

# Exclude patterns
EXCLUDE_DIRS="--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.netlify --exclude-dir=build"
SCAN_FILES="--include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.md --include=*.sql --include=*.json --include=*.yaml --include=*.yml --include=*.env* --include=*.txt"

# Pattern 1: Private key blocks
echo "  Checking for private key blocks..."
if grep -r "-----BEGIN.*PRIVATE KEY-----" $EXCLUDE_DIRS $SCAN_FILES . 2>/dev/null | grep -v "apple-music-token.ts"; then
  echo "❌ ERROR: Found private key block in repository"
  ERRORS=$((ERRORS + 1))
fi

# Pattern 2: Base64 encoded keys (likely keys starting with MII)
echo "  Checking for base64 encoded keys..."
if grep -rE "MIGTAgEAMBMGByqGSM|MIIEvQIBADANBgkqhkiG|MIIBIjANBgkqhkiG" $EXCLUDE_DIRS $SCAN_FILES . 2>/dev/null | grep -v "ZERO_SECRETS_GUARANTEE.md" | grep -v "APPLE_MUSIC_SECURITY_AUDIT.md" | grep -v "SECURITY_CHECKLIST.md"; then
  echo "❌ ERROR: Found potential base64 encoded private key"
  ERRORS=$((ERRORS + 1))
fi

# Pattern 3: Stripe live keys (not test keys, not placeholders)
echo "  Checking for Stripe live secret keys..."
if grep -rE "sk_live_[A-Za-z0-9]{99}" $EXCLUDE_DIRS $SCAN_FILES . 2>/dev/null | grep -v "SECURITY_CHECKLIST.md"; then
  echo "❌ ERROR: Found real Stripe live secret key"
  ERRORS=$((ERRORS + 1))
fi

# Pattern 4: OpenAI API keys (real ones, not placeholders)
echo "  Checking for OpenAI API keys..."
if grep -rE "sk-[A-Za-z0-9]{48}" $EXCLUDE_DIRS $SCAN_FILES . 2>/dev/null; then
  echo "❌ ERROR: Found OpenAI API key"
  ERRORS=$((ERRORS + 1))
fi

# Pattern 5: Supabase service role keys (not anon keys)
echo "  Checking for Supabase service role keys..."
if grep -rE "SUPABASE_SERVICE_ROLE_KEY\s*=\s*eyJ[A-Za-z0-9_-]{100,}" $EXCLUDE_DIRS $SCAN_FILES . 2>/dev/null; then
  echo "❌ ERROR: Found Supabase service role key in code"
  ERRORS=$((ERRORS + 1))
fi

# Pattern 6: AWS keys
echo "  Checking for AWS keys..."
if grep -rE "AKIA[A-Z0-9]{16}" $EXCLUDE_DIRS $SCAN_FILES . 2>/dev/null; then
  echo "❌ ERROR: Found AWS access key"
  ERRORS=$((ERRORS + 1))
fi

# Pattern 7: Private key files
echo "  Checking for private key files..."
if find . -type f \( -name "*.p8" -o -name "*.pem" -o -name "*.key" \) ! -path "./node_modules/*" ! -path "./dist/*" | grep -q .; then
  echo "❌ ERROR: Found private key files (.p8/.pem/.key)"
  find . -type f \( -name "*.p8" -o -name "*.pem" -o -name "*.key" \) ! -path "./node_modules/*" ! -path "./dist/*"
  ERRORS=$((ERRORS + 1))
fi

# Pattern 8: Generic secret patterns
echo "  Checking for generic secret patterns..."
if grep -rE "password\s*=\s*['\"][^'\"]{20,}['\"]|api_secret\s*=\s*['\"][^'\"]{20,}['\"]" $EXCLUDE_DIRS $SCAN_FILES . 2>/dev/null | grep -v "your_" | grep -v "example_"; then
  echo "❌ ERROR: Found potential hardcoded passwords or secrets"
  ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
if [ $ERRORS -eq 0 ]; then
  echo "✅ Secret scan passed - no secrets detected"
  echo "✅ Repository HEAD is clean"
  exit 0
else
  echo "❌ Secret scan FAILED - found $ERRORS issue(s)"
  echo ""
  echo "🔒 SECURITY WARNING:"
  echo "  Do NOT commit this code with secrets included"
  echo "  Remove all secrets and use environment variables or app_secrets table"
  echo ""
  echo "📝 Next steps:"
  echo "  1. Remove the secret values from the files"
  echo "  2. Add them to .env (locally) or app_secrets table (server-side)"
  echo "  3. Use environment variables or server-side secret reads"
  echo "  4. Re-run: npm run secret-scan"
  echo ""
  exit 1
fi
