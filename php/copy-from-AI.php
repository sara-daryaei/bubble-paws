<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Your email address
$to = "sr.daryaei63@gmail.com";  
$subject = "🐾 New Contact Form - Bubble Paws";

// Collect form data
$fullName       = $_POST['fullName']      ?? '';
$email          = $_POST['email']         ?? '';
$phone          = $_POST['phone']         ?? '';
$serviceType    = $_POST['serviceType']   ?? '';
$message        = $_POST['message']       ?? '';
$contactMethod  = $_POST['contactMethod'] ?? '';

// Validate required fields
if (empty($fullName) || empty($email) || empty($message)) {
  echo "<h3>❌ Please fill all the required fields (Name, Email, Message).</h3>";
  exit;
}

// Email body
$body = "You have a new message from Bubble Paws contact form:\n\n"
      . "Name: $fullName\n"
      . "Email: $email\n"
      . "Phone: $phone\n"
      . "Service Interest: $serviceType\n"
      . "Preferred Contact: $contactMethod\n\n"
      . "Message:\n$message\n";

// Email headers
$headers = "From: noreply@pettrim.com\r\n";
$headers .= "Reply-To: $email\r\n";
$headers .= "X-Mailer: PHP/" . phpversion();

// Send email
if (mail($to, $subject, $body, $headers)) {
  echo "<h3>✅ Message sent successfully. Thank you, $fullName!</h3>";
  echo "<p><a href='../contact/index.html'>← Back to Contact Page</a></p>";
} else {
  echo "<h3>❌ Error: Could not send the message. Please try again.</h3>";
  echo "<p><a href='../contact/index.html'>← Back to Contact Page</a></p>";
}
?>
