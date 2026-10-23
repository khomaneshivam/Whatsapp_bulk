const crypto = require("crypto");
const { getSetting, setSetting } = require("../config/database");
const config = require("../config/env");

class FlowCryptoService {
  /**
   * Generates a new RSA 2048-bit Key Pair (PKCS#8 PEM private key, SPKI PEM public key)
   */
  generateRsaKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      }
    });

    return { publicKey, privateKey };
  }

  /**
   * Retrieves the configured RSA Private Key from DB settings or environment
   */
  getPrivateKey() {
    const settingKey = getSetting("FLOWS_PRIVATE_KEY");
    if (settingKey && String(settingKey).trim()) {
      return String(settingKey);
    }
    if (config.FLOWS_PRIVATE_KEY && String(config.FLOWS_PRIVATE_KEY).trim()) {
      return String(config.FLOWS_PRIVATE_KEY);
    }
    return null;
  }

  /**
   * Retrieves or derives the corresponding RSA Public Key for uploading to Meta
   */
  getPublicKey() {
    const storedPublic = getSetting("FLOWS_PUBLIC_KEY");
    if (storedPublic && String(storedPublic).trim()) {
      return String(storedPublic).trim();
    }

    const privateKey = this.getPrivateKey();
    if (!privateKey) return null;

    try {
      const pubKeyObj = crypto.createPublicKey(privateKey);
      const pem = pubKeyObj.export({ type: "spki", format: "pem" });
      setSetting("FLOWS_PUBLIC_KEY", pem);
      return pem;
    } catch (e) {
      console.warn("[FlowCrypto] Failed to derive public key from private key:", e.message);
      return null;
    }
  }

  /**
   * Decrypts Meta Flow incoming data exchange request
   * @param {Object} params
   * @param {string} params.encrypted_flow_data Base64 ciphertext + 16-byte auth tag
   * @param {string} params.encrypted_aes_key Base64 RSA-OAEP encrypted AES-128 key
   * @param {string} params.initial_vector Base64 12-byte initialization vector
   * @param {string} [params.privateKeyOverride] Optional private key for testing
   */
  decryptFlowPayload({ encrypted_flow_data, encrypted_aes_key, initial_vector, privateKeyOverride = null }) {
    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      throw new Error("Missing required encryption parameters (encrypted_flow_data, encrypted_aes_key, initial_vector).");
    }

    const privateKey = privateKeyOverride || this.getPrivateKey();
    if (!privateKey) {
      const err = new Error("WhatsApp Flows private encryption key is not configured on the server.");
      err.statusCode = 503;
      err.code = "MISSING_PRIVATE_KEY";
      throw err;
    }

    // 1. Decrypt 128-bit AES key using RSA-OAEP with SHA-256
    let decryptedAesKey;
    try {
      decryptedAesKey = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256"
        },
        Buffer.from(encrypted_aes_key, "base64")
      );
    } catch (rsaErr) {
      const err = new Error(`RSA decryption of AES key failed: ${rsaErr.message}`);
      err.statusCode = 400;
      err.code = "INVALID_ENCRYPTED_KEY";
      throw err;
    }

    // 2. Decrypt flow data using AES-128-GCM
    let decryptedPayload;
    let iv;
    try {
      const flowDataBuffer = Buffer.from(encrypted_flow_data, "base64");
      const authTagLength = 16;
      if (flowDataBuffer.length < authTagLength) {
        throw new Error("Encrypted flow data buffer is shorter than auth tag length.");
      }

      const ciphertext = flowDataBuffer.subarray(0, flowDataBuffer.length - authTagLength);
      const authTag = flowDataBuffer.subarray(flowDataBuffer.length - authTagLength);
      iv = Buffer.from(initial_vector, "base64");

      const decipher = crypto.createDecipheriv("aes-128-gcm", decryptedAesKey, iv);
      decipher.setAuthTag(authTag);

      const plaintextBuffer = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);

      decryptedPayload = JSON.parse(plaintextBuffer.toString("utf8"));
    } catch (gcmErr) {
      const err = new Error(`AES-GCM decryption failed: ${gcmErr.message}`);
      err.statusCode = 400;
      err.code = "GCM_DECRYPTION_ERROR";
      throw err;
    }

    return {
      decryptedPayload,
      aesKey: decryptedAesKey,
      initialVector: iv
    };
  }

  /**
   * Encrypts outgoing response payload for Meta Flow client
   * @param {Object} params
   * @param {Object} params.responsePayload Plaintext JSON response object
   * @param {Buffer} params.aesKey Decrypted 16-byte AES key
   * @param {Buffer} params.initialVector Original 12-byte initialization vector
   */
  encryptFlowResponse({ responsePayload, aesKey, initialVector }) {
    if (!responsePayload || !aesKey || !initialVector) {
      throw new Error("Missing parameters for encryptFlowResponse.");
    }

    // Invert IV: bitwise NOT of each byte (~iv[i])
    const invertedIv = Buffer.alloc(initialVector.length);
    for (let i = 0; i < initialVector.length; i++) {
      invertedIv[i] = ~initialVector[i];
    }

    const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, invertedIv);
    const jsonStr = JSON.stringify(responsePayload);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(jsonStr, "utf8")),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // Response is ciphertext + authTag, Base64-encoded
    const finalBuffer = Buffer.concat([ciphertext, authTag]);
    return finalBuffer.toString("base64");
  }

  /**
   * Dispatches business actions for Dynamic Flow requests (e.g. ping, INIT, data_exchange)
   */
  processFlowAction(payload) {
    const action = payload?.action || "ping";
    const screen = payload?.screen || "";
    const data = payload?.data || {};

    // 1. Meta Health Check / Ping
    if (action === "ping") {
      return {
        version: "3.0",
        data: {
          status: "active"
        }
      };
    }

    // 2. Initial Screen load (INIT)
    if (action === "INIT") {
      return {
        version: "3.0",
        screen: screen || "WELCOME_SCREEN",
        data: {
          ...data,
          service_status: "online",
          available_dates: [
            new Date(Date.now() + 86400000).toISOString().split("T")[0],
            new Date(Date.now() + 172800000).toISOString().split("T")[0],
            new Date(Date.now() + 259200000).toISOString().split("T")[0]
          ]
        }
      };
    }

    // 3. Dynamic Data Exchange (Form step navigation or dynamic validation)
    if (action === "data_exchange") {
      return {
        version: "3.0",
        screen: screen,
        data: {
          ...data,
          verified: true,
          processed_at: new Date().toISOString()
        }
      };
    }

    // 4. Default fallback response
    return {
      version: "3.0",
      data: {
        status: "success",
        message: "Request processed successfully."
      }
    };
  }

  /**
   * Alias for processFlowAction to match test expectations
   */
  handleFlowAction(payload) {
    return this.processFlowAction(payload);
  }
}

module.exports = new FlowCryptoService();
