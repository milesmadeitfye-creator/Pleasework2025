import type { Handler } from "@netlify/functions";
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[email_capture_submit] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const parsed = JSON.parse(event.body);
    const { slug, email, name, phone } = parsed;

    if (!slug || !email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'slug and email are required',
          error_code: 'MISSING_FIELDS',
          contact: null,
        }),
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid email format',
          error_code: 'INVALID_EMAIL',
          contact: null,
        }),
      };
    }

    console.log('[email_capture_submit] Looking up email capture link:', slug);

    // Look up the email capture link
    const { data: emailCaptureLink, error: linkError } = await supabase
      .from('email_capture_links')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (linkError) {
      console.error('[email_capture_submit] Error fetching link:', linkError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Failed to fetch email capture link',
          error_code: 'DATABASE_ERROR',
          contact: null,
          supabase_error: {
            message: linkError.message,
            code: linkError.code,
            details: linkError.details,
            hint: linkError.hint,
          },
        }),
      };
    }

    if (!emailCaptureLink) {
      console.log('[email_capture_submit] Email capture link not found:', slug);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'This email signup link is no longer active',
          error_code: 'EMAIL_CAPTURE_NOT_FOUND',
          contact: null,
        }),
      };
    }

    console.log('[email_capture_submit] Found link, owner:', emailCaptureLink.user_id);

    // Upsert contact into fan_contacts
    const contactData = {
      owner_id: emailCaptureLink.user_id,
      user_id: emailCaptureLink.user_id,
      email: email.toLowerCase().trim(),
      name: name?.trim() || null,
      phone: phone?.trim() || null,
      source: 'email_capture',
      email_capture_link_id: emailCaptureLink.id,
      consent_email: true,
      meta: {
        captured_via: 'email_capture_landing',
        link_slug: slug,
        link_title: emailCaptureLink.title,
        captured_at: new Date().toISOString(),
      },
    };

    console.log('[email_capture_submit] Upserting contact:', {
      owner_id: contactData.owner_id,
      email: contactData.email,
    });

    const { data: contact, error: contactError } = await supabase
      .from('fan_contacts')
      .upsert(contactData, {
        onConflict: 'owner_id,email',
        ignoreDuplicates: false,
      })
      .select()
      .maybeSingle();

    if (contactError) {
      console.error('[email_capture_submit] Error creating contact:', contactError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Failed to save contact',
          error_code: 'CONTACT_SAVE_FAILED',
          contact: null,
          supabase_error: {
            message: contactError.message,
            code: contactError.code,
          },
        }),
      };
    }

    if (!contact) {
      console.error('[email_capture_submit] No contact returned but no error');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Contact insert succeeded but returned no data',
          error_code: 'NO_CONTACT_RETURNED',
          contact: null,
        }),
      };
    }

    console.log('[email_capture_submit] Contact saved successfully:', contact.id);

    // Log event to fan_contact_events
    try {
      const eventData = {
        fan_contact_id: contact.id,
        user_id: emailCaptureLink.user_id,
        event_type: 'email_capture_signup',
        link_slug: slug,
        link_type: 'email_capture',
      };

      const { error: eventError } = await supabase
        .from('fan_contact_events')
        .insert(eventData);

      if (eventError) {
        console.error('[email_capture_submit] Error logging event:', eventError);
        // Non-fatal - don't fail the request
      } else {
        console.log('[FanContacts] Logged event', {
          event_type: 'email_capture_signup',
          link_slug: slug,
          link_type: 'email_capture',
        });
      }
    } catch (eventErr: any) {
      console.error('[email_capture_submit] Event logging error (non-fatal):', eventErr.message);
    }

    // Update user_id field for consistency with new schema
    if (!contact.user_id && contact.owner_id) {
      await supabase
        .from('fan_contacts')
        .update({ user_id: contact.owner_id })
        .eq('id', contact.id);
    }

    console.log('[FanContacts] Upserted contact', {
      user_id: emailCaptureLink.user_id,
      email: contact.email,
      hasPhone: !!contact.phone,
      source: 'email_capture',
      fan_contact_id: contact.id,
    });

    // Also insert into email_capture_submissions for tracking
    try {
      await supabase.from('email_capture_submissions').insert({
        link_id: emailCaptureLink.id,
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        name: name?.trim() || null,
      });
    } catch (submissionErr: any) {
      console.error('[email_capture_submit] Error saving submission (non-fatal):', submissionErr.message);
    }

    // Sync to Mailchimp if user has it connected
    try {
      const { data: mailchimpConnection } = await supabase
        .from('mailchimp_connections')
        .select('*')
        .eq('user_id', emailCaptureLink.user_id)
        .maybeSingle();

      if (mailchimpConnection && mailchimpConnection.access_token) {
        // Determine list ID: per-capture override > user default > fallback
        let listId = emailCaptureLink.mailchimp_list_id;

        if (!listId) {
          const { data: settings } = await supabase
            .from('user_mailchimp_settings')
            .select('default_list_id')
            .eq('user_id', emailCaptureLink.user_id)
            .maybeSingle();

          listId = settings?.default_list_id || mailchimpConnection.list_id || process.env.MAILCHIMP_LIST_ID;
        }

        if (!listId) {
          console.log('[email_capture_submit] No Mailchimp list configured for user');
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              error: null,
              error_code: null,
              contact: {
                id: contact.id,
                email: contact.email,
                name: contact.name,
              },
            }),
          };
        }

        // Get tags from capture configuration
        const tagNames = emailCaptureLink.mailchimp_tag_names || [];

        console.log('[email_capture_submit] Mailchimp connected, syncing contact', {
          userId: emailCaptureLink.user_id,
          listId,
          tags: tagNames,
        });

        const serverPrefix = mailchimpConnection.server_prefix || mailchimpConnection.data_center || mailchimpConnection.dc || 'us13';
        const mailchimpApiUrl = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${listId}/members`;
        const subscriberHash = createHash('md5').update(contact.email.toLowerCase()).digest('hex');

        const mailchimpData = {
          email_address: contact.email.toLowerCase(),
          status: 'subscribed',
          merge_fields: {
            FNAME: contact.name?.split(' ')[0] || '',
            LNAME: contact.name?.split(' ').slice(1).join(' ') || '',
          },
        };

        const mailchimpResponse = await fetch(`${mailchimpApiUrl}/${subscriberHash}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${mailchimpConnection.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mailchimpData),
        });

        if (mailchimpResponse.ok) {
          console.log('[email_capture_submit] Successfully synced to Mailchimp');
          await supabase.from('fan_contacts').update({
            synced_to_mailchimp: true,
            mailchimp_id: subscriberHash,
          }).eq('id', contact.id);

          // Apply tags if specified
          if (tagNames.length > 0) {
            console.log('[email_capture_submit] Applying tags', { tags: tagNames });

            for (const tagName of tagNames) {
              const tagUrl = `${mailchimpApiUrl}/${subscriberHash}/tags`;
              const tagRes = await fetch(tagUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${mailchimpConnection.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  tags: [{ name: tagName, status: 'active' }],
                }),
              });

              if (!tagRes.ok) {
                const tagError = await tagRes.text();
                console.error('[email_capture_submit] Failed to apply tag', { tagName, error: tagError });
              } else {
                console.log('[email_capture_submit] Tag applied successfully', { tagName });
              }
            }
          }
        } else {
          const errorText = await mailchimpResponse.text();
          console.error('[email_capture_submit] Mailchimp sync failed:', errorText);
        }
      } else {
        console.log('[email_capture_submit] Mailchimp not connected');
      }
    } catch (mailchimpError: any) {
      console.error('[email_capture_submit] Mailchimp sync error (non-fatal):', mailchimpError.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        error: null,
        error_code: null,
        contact: {
          id: contact.id,
          email: contact.email,
          name: contact.name,
        },
      }),
    };
  } catch (err: any) {
    console.error('[email_capture_submit] Unhandled error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        error_code: 'INTERNAL_ERROR',
        contact: null,
        supabase_error: {
          message: err && err.message,
        },
      }),
    };
  }
};
