// Security module for file protection and logging
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Security Configuration
const securityConfig = {
    maxRequestsPerMinute: 60,
    maxSearchHistory: 10,
    csrfTokenName: 'x-csrf-token',
    allowedDomains: ['cfx.re', 'servers.fivem.net'],
    sanitizationRules: {
        allowedTags: ['b', 'i', 'em', 'strong'],
        allowedAttributes: {}
    }
};

// Rate limiting implementation
class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.requests = new Map();
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
    }

    isAllowed(clientId) {
        const now = Date.now();
        const clientRequests = this.requests.get(clientId) || [];
        const recentRequests = clientRequests.filter(time => now - time < this.timeWindow);
        
        if (recentRequests.length >= this.maxRequests) {
            return false;
        }

        recentRequests.push(now);
        this.requests.set(clientId, recentRequests);
        return true;
    }
}

// Input sanitization
function sanitizeInput(input) {
    if (!input) return '';
    return input.replace(/[<>'"]/g, char => ({
        '<': '&lt;',
        '>': '&gt;',
        "'": '&apos;',
        '"': '&quot;'
    })[char]);
}

// URL validation
function isValidFiveMUrl(url) {
    try {
        const urlObj = new URL(url);
        return securityConfig.allowedDomains.some(domain => urlObj.hostname.endsWith(domain));
    } catch {
        return false;
    }
}

// CSRF Token management
function generateCSRFToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

// Secure storage operations
const secureStorage = {
    set: (key, value) => {
        try {
            const secureValue = JSON.stringify({
                data: value,
                timestamp: Date.now()
            });
            localStorage.setItem(key, secureValue);
        } catch (error) {
            console.error('Storage error:', error.message);
        }
    },
    
    get: (key) => {
        try {
            const item = localStorage.getItem(key);
            if (!item) return null;
            
            const { data, timestamp } = JSON.parse(item);
            // Check if data is older than 24 hours
            if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
                localStorage.removeItem(key);
                return null;
            }
            return data;
        } catch {
            return null;
        }
    }
};

class SecurityManager {
    constructor() {
        this.logPath = path.join(__dirname, 'security.log');
        this.encryptionKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    }

    // Log security events
    async logEvent(event, details) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${event}: ${JSON.stringify(details)}\n`;
        await fs.promises.appendFile(this.logPath, logEntry, 'utf8');
    }

    // Encrypt file content
    async encryptFile(filePath) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(this.encryptionKey, 'hex'), iv);
            
            let encrypted = cipher.update(content, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();

            const encryptedData = {
                iv: iv.toString('hex'),
                content: encrypted,
                authTag: authTag.toString('hex')
            };

            await fs.promises.writeFile(`${filePath}.enc`, JSON.stringify(encryptedData));
            await this.logEvent('FILE_ENCRYPTED', { file: filePath });
            return true;
        } catch (error) {
            await this.logEvent('ENCRYPTION_ERROR', { file: filePath, error: error.message });
            throw new Error('فشل في تشفير الملف');
        }
    }

    // Decrypt file content
    async decryptFile(encryptedFilePath) {
        try {
            const encryptedData = JSON.parse(await fs.promises.readFile(encryptedFilePath, 'utf8'));
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                Buffer.from(this.encryptionKey, 'hex'),
                Buffer.from(encryptedData.iv, 'hex')
            );
            
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            await this.logEvent('FILE_DECRYPTED', { file: encryptedFilePath });
            return decrypted;
        } catch (error) {
            await this.logEvent('DECRYPTION_ERROR', { file: encryptedFilePath, error: error.message });
            throw new Error('فشل في فك تشفير الملف');
        }
    }

    // Check if file is protected
    async isFileProtected(filePath) {
        return fs.promises.access(`${filePath}.enc`)
            .then(() => true)
            .catch(() => false);
    }
}

module.exports = {
    securityConfig,
    RateLimiter,
    sanitizeInput,
    isValidFiveMUrl,
    generateCSRFToken,
    secureStorage,
    SecurityManager: new SecurityManager()
};
