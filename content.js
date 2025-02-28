// Function to fill the Create Source form with selected information
function fillSourceForm(data) {
  console.log('Received data:', data);

  // Wait for a DOM element to appear
  function waitForElement(selector, callback) {
    const intervalId = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(intervalId);
        callback(element);
      }
    }, 100); // Check every 100ms
  }

  // Wait for the button to appear
  waitForElement('[data-testid="source-box-create-source-button"]', (createSourceButton) => {
    // Click the "Create Source" button
    // const createSourceButton = document.querySelector('[data-testid="source-box-create-source-button"]');
    if (createSourceButton) {
      createSourceButton.click();
      console.log('Create Source button clicked');
    } else {
      console.log('Create Source button not found');
    }
  });

  // Wait for the form to appear
  waitForElement('input[data-testid="source-date-field"]', (createSourceForm) => {
    console.log('Create Source Form open');
    setTimeout(() => {
      // Fill the form with selected information
      document.querySelector('input[data-testid="source-date-field"]').value = data.date;
      document.querySelector('input[data-testid="source-title-field"]').value = data.title;
      document.querySelector('input[data-testid="source-web-page-field"]').value = data.url;
      document.querySelector('textarea[data-testid="source-citation-field"]').value = data.citation;
      document.querySelector('textarea[data-testid="source-notes-field"]').value = data.notes;

      console.log('Form fields filled');
    }, 2000); // Adjust the timeout as necessary to allow the page to complete loading
  });
}

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fillForm') {
    fillSourceForm(request.data);
  }
  // Send response back to popup.js
  sendResponse({status: 'success'});
});
