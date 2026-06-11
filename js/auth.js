const signupForm = document.querySelector("[data-signup-form]");
const signupStatus = document.querySelector("[data-signup-status]");

function setSignupStatus(message, isError = false) {
  if (!signupStatus) return;
  signupStatus.textContent = message;
  signupStatus.classList.toggle("text-danger", isError);
  signupStatus.classList.toggle("text-success", !isError && Boolean(message));
}

if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = signupForm.querySelector("button[type='submit']");
    const formData = new FormData(signupForm);
    const payload = Object.fromEntries(formData.entries());

    submitButton.disabled = true;
    setSignupStatus("Creating your account...");

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Signup failed.");
      }

      signupForm.reset();
      setSignupStatus("Account created successfully. Your information has been saved.");
    } catch (error) {
      setSignupStatus(error.message || "Signup failed. Please try again.", true);
    } finally {
      submitButton.disabled = false;
    }
  });
}
