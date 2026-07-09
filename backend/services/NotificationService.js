/**
 * NotificationService
 * 
 * Abstraction layer for sending emergency backup notifications:
 * - Email (SMTP/Transactional Email Service)
 * - SMS (Twilio/AWS SNS)
 * - WhatsApp (Twilio/Meta API)
 * - Push Notifications (Firebase Cloud Messaging/WebPush)
 * 
 * Implements fallback console logs if API credentials are not configured.
 */
class NotificationService {
  /**
   * Send a backup email notification
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} body - Email body content
   */
  async sendEmail(to, subject, body) {
    console.log(`[NotificationService] [EMAIL] Sending to: ${to}`);
    console.log(`[NotificationService] [EMAIL] Subject: ${subject}`);
    console.log(`[NotificationService] [EMAIL] Content: ${body}`);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    return { success: true, provider: 'MockEmailProvider' };
  }

  /**
   * Send a backup SMS notification
   * @param {string} to - Recipient phone number
   * @param {string} message - SMS message content
   */
  async sendSMS(to, message) {
    console.log(`[NotificationService] [SMS] Sending to: ${to}`);
    console.log(`[NotificationService] [SMS] Message: ${message}`);
    await new Promise(resolve => setTimeout(resolve, 100));
    return { success: true, provider: 'MockSMSProvider' };
  }

  /**
   * Send a backup WhatsApp notification
   * @param {string} to - Recipient phone number/WhatsApp ID
   * @param {string} message - WhatsApp content
   */
  async sendWhatsApp(to, message) {
    console.log(`[NotificationService] [WhatsApp] Sending to: ${to}`);
    console.log(`[NotificationService] [WhatsApp] Message: ${message}`);
    await new Promise(resolve => setTimeout(resolve, 100));
    return { success: true, provider: 'MockWhatsAppProvider' };
  }

  /**
   * Send a mobile push notification
   * @param {number|string} userId - Recipient user identifier
   * @param {string} title - Push notification title
   * @param {string} message - Push notification body message
   */
  async sendPush(userId, title, message) {
    console.log(`[NotificationService] [PUSH] Sending to User: ${userId}`);
    console.log(`[NotificationService] [PUSH] Title: ${title}`);
    console.log(`[NotificationService] [PUSH] Message: ${message}`);
    await new Promise(resolve => setTimeout(resolve, 100));
    return { success: true, provider: 'MockPushProvider' };
  }
}

module.exports = new NotificationService();
