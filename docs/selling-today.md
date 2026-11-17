# Prepare and post an item today

Use the [private cloud workspace](https://reseller-agent-cloud.pandabur.chatgpt.site) for real inventory. The separate demo keeps data only in its browser and does not sync or import into the cloud.

## Sign in

Until the email-code release is published, use the normal Safari/Chrome browser and finish the newest sign-in email link in that browser. Opening a link in Safari does not automatically sign in a separate Home Screen app. The code-entry update is prepared; its email-template configuration is still pending. Check [current status](project-status.md) before following newer code instructions.

Use your own email/account. Artie and Janyl each have private inventory; one person's saved items are not automatically shared with the other. Already-activated users do not need another invitation. If the backend has paused, an owner must restore the existing Supabase project; reinstalling the icon or repeatedly requesting emails will not restore it.

## Prepare once

1. Choose **Add item**. Enter the title, category, condition, asking price in PHP and a factual description. Include visible flaws, exactly what comes with it, and any pickup/delivery terms you have decided. Use `0` only if you intend the item to be free.
2. Add up to **ten photos**. Keep the original photos in your phone/computer so you can select them again on each marketplace. Supported inputs are JPEG, PNG and WebP, up to 10 MB each. Export iPhone HEIC to JPEG first. The app resizes/re-encodes saved photos to reduce storage and remove camera metadata.
3. Choose **Generate listing copy**. The published cloud app currently produces labeled templates because no paid OpenAI listing key is configured. The copy is based on the facts you typed; it does not inspect photos, research prices or verify condition/authenticity. Review and tailor each platform's title and description yourself.
4. Choose **Save item**. Mark it **Ready** once you have reviewed the price, description, flaws and photos. Save after changing its status too.

## Publish on each platform

1. Open the saved item and select **Carousell**, **Marketplace** or **Groups**.
2. Review its platform title/description, then choose **Copy title**, **Copy description** or **Copy post**. A displayed price warning helps find old amounts. Changing the item's price does not rewrite previously edited listing copy.
3. Open the platform's usual listing/post form. Select the original photos and paste the appropriate text. On Facebook, choose the intended Marketplace category or Group yourself. Confirm the price, audience and platform-required fields, then publish there.
4. Return to Reseller Agent. Paste the actual published URL into that channel's **listing URL**, choose **Published**, and save. Set the overall item to **Listed** when appropriate.
5. Repeat for the other channels you want. Copying does not publish, and marking Published does not verify the external listing.

If automatic copying fails, the prepared next release provides a **Copy listing manually** text box with the exact requested text. The live version may instead direct you to copy from its editable fields. On phone, press and hold to select/copy text. Editing or switching channels withdraws a stale fallback. A delayed browser clipboard operation may still finish; check the text you paste before publishing.

## Keep the inventory accurate

Use **Draft → Ready → Listed → Reserved → Sold** as a practical sequence. You can select states manually to fit the sale. Save changes. Each channel's publication status is separate from the overall item status.

If you lower a price, change condition or sell/reserve an item, update the actual posts yourself as well. The app does not modify or remove external listings. The sold dashboard total uses asking prices; it is not a payment or profit record.

If a save times out, keep your edits and reload/reconcile inventory before deliberately retrying. A request can have committed even when the acknowledgment was lost. If two devices edit the same item, an older edit is rejected instead of silently overwriting the newer save. Reopen the latest item before trying again.

## Handle a buyer question

1. In the app, choose **Open buyer inbox** and select the saved item.
2. Paste the buyer question yourself, choose its channel and private-message/public-comment source, then save.
3. Write a reply or use the labeled template as a starting point. Confirm availability, terms and any question the template did not answer. Save the draft, review it and explicitly approve it.
4. Copy the approved reply and send it through the original platform yourself. Return and mark **Answered** after sending. Copying alone does not mark it answered.

A changed item price/status, question or relevant seller term requires another review. Automatic question capture and automatic sending are unavailable. One supervised OpenClaw buyer-draft trial succeeded, but the worker is paused and another model trial needs fresh allowance/account checks. Hermes is not a connected fallback. Routine manual/templates use no model call.

## What to check on your actual phone

First verify an item with a few photos saves and reopens from the same private account; then check all ten photos, platform text paste, listing-URL save and a manual buyer reply. Code sign-in inside the installed PWA is a separate acceptance step after the matching release is configured. Internet is required; unsaved edits are not queued if you close/reload offline.
