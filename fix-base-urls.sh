#!/bin/bash

# Fix SmartLinks.tsx
cat > /tmp/smartlinks-fix.txt << 'EOF'
  const copyLink = (slug: string) => {
    const baseUrl = import.meta.env.VITE_SITE_URL || 'https://ghoste.one';
    navigator.clipboard.writeText(`${baseUrl}/l/${slug}`);
    showToast('Link copied to clipboard!', 'success');
  };
EOF

# Fix SmartLinksEnhanced.tsx
cat > /tmp/smartlinksenhanced-fix.txt << 'EOF'
  const generateGhosteUrl = (slug: string) => {
    const baseUrl = import.meta.env.VITE_SITE_URL || 'https://ghoste.one';
    return `${baseUrl.replace('https://', '')}/l/${slug}`;
  };
EOF

# Fix OneClickLinks.tsx
cat > /tmp/oneclicklinks-fix.txt << 'EOF'
  const copyLink = (shortCode: string) => {
    const baseUrl = import.meta.env.VITE_SITE_URL || 'https://ghoste.one';
    const url = `${baseUrl}/go/${shortCode}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(shortCode);
    showToast('Link copied to clipboard! 📋', 'success');
    setTimeout(() => setCopiedCode(null), 2000);
  };
EOF

echo "Fix files created successfully"
