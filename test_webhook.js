async function runTests() {
  console.log("=== Testing WhatsApp Webhooks & Token Verification ===");

  // 1. Fetch Webhook Config
  const resConfig = await fetch("http://localhost:5000/api/webhook/config");
  const configData = await resConfig.json();
  console.log("[1] Webhook Config:", configData);
  if (!configData.success || !configData.data.verifyToken) {
    throw new Error("Failed to get webhook config or verify token");
  }
  const currentToken = configData.data.verifyToken;

  // 2. Test Meta Handshake Verification on /webhook
  const challengeStr = "CHALLENGE_CODE_123456789";
  const urlWithParams = `http://localhost:5000/webhook?hub.mode=subscribe&hub.challenge=${challengeStr}&hub.verify_token=${encodeURIComponent(currentToken)}`;
  const verifyRes = await fetch(urlWithParams);
  const verifyBody = await verifyRes.text();
  console.log("[2] /webhook Handshake Status:", verifyRes.status, "Body:", verifyBody);
  if (verifyRes.status !== 200 || verifyBody !== challengeStr) {
    throw new Error(`Handshake verification failed: ${verifyRes.status} -> ${verifyBody}`);
  }

  // 3. Test Meta Handshake on /api/webhook
  const apiUrlWithParams = `http://localhost:5000/api/webhook?hub.mode=subscribe&hub.challenge=${challengeStr}&hub.verify_token=${encodeURIComponent(currentToken)}`;
  const apiVerifyRes = await fetch(apiUrlWithParams);
  const apiVerifyBody = await apiVerifyRes.text();
  console.log("[3] /api/webhook Handshake Status:", apiVerifyRes.status, "Body:", apiVerifyBody);
  if (apiVerifyRes.status !== 200 || apiVerifyBody !== challengeStr) {
    throw new Error(`/api/webhook handshake failed`);
  }

  // 4. Test Invalid Token Rejection
  const invalidUrl = `http://localhost:5000/webhook?hub.mode=subscribe&hub.challenge=${challengeStr}&hub.verify_token=WRONG_TOKEN`;
  const invalidRes = await fetch(invalidUrl);
  console.log("[4] Invalid Token Status (Expect 403):", invalidRes.status);
  if (invalidRes.status !== 403) {
    throw new Error("Invalid token did not return 403");
  }

  // 5. Test Incoming Customer Reply (Meta Webhook POST)
  const fakeMetaPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+919876543210",
                phone_number_id: "1292128907326342"
              },
              contacts: [
                {
                  profile: { name: "Rajesh Sharma" },
                  wa_id: "919876543210"
                }
              ],
              messages: [
                {
                  from: "919876543210",
                  id: `wamid.TEST_${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "Hello! We are interested in joining KonkanTrip partner network." }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  const postRes = await fetch("http://localhost:5000/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fakeMetaPayload)
  });
  const postBody = await postRes.text();
  console.log("[5] /webhook POST Status:", postRes.status, "Body:", postBody);
  if (postRes.status !== 200) {
    throw new Error("POST /webhook failed");
  }

  // Wait 500ms for async insertion
  await new Promise(r => setTimeout(r, 500));

  // 6. Test GET /api/replies
  const repliesRes = await fetch("http://localhost:5000/api/replies");
  const repliesData = await repliesRes.json();
  console.log("[6] Replies Count:", repliesData.data.length, "First reply:", repliesData.data[0]);
  if (!repliesData.success || repliesData.data.length === 0) {
    throw new Error("Customer reply was not saved");
  }
  const replyId = repliesData.data[0].id;

  // 7. Test Mark as Read
  const markRes = await fetch(`http://localhost:5000/api/replies/${replyId}/mark-read`, { method: "POST" });
  const markData = await markRes.json();
  console.log("[7] Mark Read Result:", markData);

  // 8. Test Generate New Token
  const genRes = await fetch("http://localhost:5000/api/webhook/generate-token", { method: "POST" });
  const genData = await genRes.json();
  console.log("[8] Generate New Token:", genData);
  if (!genData.success || !genData.data.verifyToken.startsWith("wb_verify_")) {
    throw new Error("Token generation failed");
  }

  // Verify new token works on handshake
  const newHandshakeUrl = `http://localhost:5000/webhook?hub.mode=subscribe&hub.challenge=NEW_CHALLENGE&hub.verify_token=${encodeURIComponent(genData.data.verifyToken)}`;
  const newHandshakeRes = await fetch(newHandshakeUrl);
  const newHandshakeBody = await newHandshakeRes.text();
  console.log("[9] New Token Handshake Status:", newHandshakeRes.status, "Body:", newHandshakeBody);
  if (newHandshakeRes.status !== 200 || newHandshakeBody !== "NEW_CHALLENGE") {
    throw new Error("New token failed handshake");
  }

  console.log("\n🎉 ALL 9 WEBHOOK TESTS PASSED SUCCESSFULLY!");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
