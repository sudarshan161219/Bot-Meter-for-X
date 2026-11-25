// Uninstall feedback (uninstall.html). Chrome opens this page when Bot Meter is
// removed, with ?v=<version>. Answers go straight to a Google Form; nothing else
// is collected and nothing is stored on this site.
//
// To connect your form:
//  1. Create a Google Form with three "Short answer" questions: Reason, Details, Version.
//  2. Form menu (⋮) > "Get pre-filled link", type anything into each field, "Get link".
//     The link has "entry.<number>=..." for each field: copy those numbers below.
//  3. FORM_ID is the long id in the link: docs.google.com/forms/d/e/<FORM_ID>/viewform
// Until FORM_ID is set, the page shows only the goodbye and help links.
const FEEDBACK_FORM = {
  FORM_ID: '',
  fields: { reason: 'entry.0', details: 'entry.0', version: 'entry.0' },
};

(() => {
  const form = document.getElementById('leave');
  const thanks = document.getElementById('thanks');
  const error = document.getElementById('error');
  const { FORM_ID, fields } = FEEDBACK_FORM;
  if (!FORM_ID) return; // not connected yet: no form to fill in for nothing

  const version = (new URLSearchParams(location.search).get('v') ?? '').slice(0, 20);
  form.hidden = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const body = new URLSearchParams({
      [fields.reason]: String(data.get('reason') ?? ''),
      [fields.details]: String(data.get('details') ?? '').slice(0, 1000),
      [fields.version]: version || 'unknown',
    });
    const button = form.querySelector('button');
    button.disabled = true;
    error.hidden = true;
    try {
      // Google Forms doesn't allow reading the reply from another site
      // (no-cors), so a request that goes through counts as sent.
      await fetch(`https://docs.google.com/forms/d/e/${encodeURIComponent(FORM_ID)}/formResponse`, {
        method: 'POST',
        mode: 'no-cors',
        body,
      });
      form.hidden = true;
      thanks.hidden = false;
    } catch {
      error.hidden = false;
      button.disabled = false;
    }
  });
})();
