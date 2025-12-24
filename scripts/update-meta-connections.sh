#!/bin/bash

# Update all references from meta_connections to user_meta_connections

echo "Updating Netlify Functions..."

find netlify/functions -type f -name "*.ts" -print0 | while IFS= read -r -d '' file; do
  if grep -q "meta_connections" "$file"; then
    echo "Updating: $file"
    # Create temp file
    sed 's/meta_connections/user_meta_connections/g' "$file" > "$file.tmp"
    # Replace original
    mv "$file.tmp" "$file"
  fi
done

echo "✓ Update complete!"
