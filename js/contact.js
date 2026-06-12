const contactForm = document.querySelector("[data-contact-form]");
const contactStatus = document.querySelector("[data-contact-status]");
const appointmentDateInput = document.querySelector("[data-appointment-date]");

function setContactStatus(message, isError = false) {
  if (!contactStatus) return;
  contactStatus.textContent = message;
  contactStatus.classList.toggle("text-danger", isError);
  contactStatus.classList.toggle("text-success", !isError && Boolean(message));
}

if (appointmentDateInput) {
  appointmentDateInput.min = new Date().toISOString().split("T")[0];
}

if (contactForm) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = contactForm.querySelector("button[type='submit']");
    const formData = new FormData(contactForm);
    const payload = Object.fromEntries(formData.entries());

    submitButton.disabled = true;
    setContactStatus("Sending your message...");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Message could not be sent.");
      }

      contactForm.reset();
      if (appointmentDateInput) {
        appointmentDateInput.min = new Date().toISOString().split("T")[0];
      }
      setContactStatus("Thank you. Your message and appointment request have been saved.");
    } catch (error) {
      setContactStatus(error.message || "Message could not be sent. Please try again.", true);
    } finally {
      submitButton.disabled = false;
    }
  });
}
