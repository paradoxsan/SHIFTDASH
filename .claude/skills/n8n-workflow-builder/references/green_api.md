# Green API — method catalog and n8n payload shapes

Green API exposes WhatsApp via simple HTTP endpoints. In n8n, call them with HTTP Request nodes.
The instance id and token live in the URL. There are two hosts:

- **API host** for messaging/service: `https://api.green-api.com/waInstance{idInstance}/{method}/{apiToken}`
- **Media host** for file upload/download: `https://media.green-api.com/waInstance{idInstance}/{method}/{apiToken}`

Use obvious fake values in templates: idInstance `1101000000`, token `FAKEGREENTOKEN…`.
`chatId` format: `<phone>@c.us` for private chats, `<group>@g.us` for groups.

## Receiving incoming messages (the trigger)

Configure Green API (in their console) to POST incoming notifications to a core **Webhook** node's
production URL. Filter for the right event:

```
$json.body.typeWebhook === 'incomingMessageReceived'
```

Extract fields from the payload:
- chat id: `$json.body.senderData.chatId`
- sender name: `$json.body.senderData.senderName`
- text: `$json.body.messageData.textMessageData?.textMessage`
  or `$json.body.messageData.extendedTextMessageData?.text`

## Sending — method catalog

**Messaging / sending:**
- `sendMessage` — text. Body: `{ chatId, message }`
- `sendFileByUrl` — file from a public URL. Body: `{ chatId, urlFile, fileName, caption }`
- `sendFileByUpload` — file via form-data upload
- `uploadFile` — upload raw bytes to Green storage, returns `{ urlFile }` (15-day life). See below.
- `sendLocation` — `{ chatId, latitude, longitude, ... }`
- `sendContact` — send a contact card
- `sendLink` — message with link preview
- `sendPoll` — `{ chatId, message, options: [{optionName}], multipleAnswers }`
- `forwardMessages` — forward to another chat
- On supported tiers: `sendButtons`, `sendTemplateButtons`, `sendListMessage`, `sendInteractiveButtons`

**Service:**
- `checkWhatsapp` — does a number have WhatsApp
- `getAvatar`, `getContacts`, `getContactInfo`
- `readChat` — mark read
- `archiveChat`, `unarchiveChat`, `setDisappearingChat`
- `editMessage`, `deleteMessage`

**Groups:**
- `createGroup`, `updateGroupName`, `getGroupData`
- `addGroupParticipant`, `removeGroupParticipant`
- `setGroupAdmin`, `removeAdmin`, `setGroupPicture`, `leaveGroup`

**History / journal:**
- `getChatHistory`, `getMessage`, `lastIncomingMessages`, `lastOutgoingMessages`

**Account:**
- `getStateInstance`, `getQR`, `getSettings`, `setSettings`, `reboot`, `logout`

## Sending a generated image (the base64 → binary → upload chain)

A generated image arrives as base64. `sendFileByUrl` needs a public URL. `uploadFile` bridges the
gap, but it wants the **raw binary** as the request body — not base64, not JSON. So in n8n:

1. **Convert to File** node (`n8n-nodes-base.convertToFile`, op `toBinary`): source the base64
   property (e.g. the image API's `...inlineData.data`), set `dataIsBase64: true`, mimeType
   `image/png`, fileName `post.png`. Produces binary data on the item.
2. **HTTP Request** to `uploadFile` on the **media host**:
   - method POST, header `Content-Type: image/png`
   - `contentType: binaryData`, `inputDataFieldName: data` (sends the binary as the raw body)
   - returns `{ urlFile: "https://...storage.../...png" }`
3. **Set** node: `media_url = $json.urlFile`, carry `caption` and `chat_id` forward.
4. **sendFileByUrl** with `{ chatId, urlFile: media_url, fileName, caption }`.

## Video caveat

Veo returns a URI on Google's servers that usually needs the API key to download — `sendFileByUrl`
may not be able to fetch it directly. If so, download the video then run the same
uploadFile → sendFileByUrl chain as for images.
