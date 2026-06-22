export const deviceAuthorizationPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize Hem CLI</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { display: grid; min-height: 100vh; margin: 0; place-items: center; }
    main { max-width: 28rem; padding: 2rem; text-align: center; }
    form { display: grid; gap: .75rem; margin: 1.5rem 0; text-align: left; }
    input { box-sizing: border-box; font: inherit; padding: .7rem; width: 100%; }
    button { cursor: pointer; font: inherit; padding: .7rem 1rem; }
    .actions { display: flex; gap: .75rem; justify-content: center; }
    code { font-size: 1.25rem; }
  </style>
</head>
<body>
  <main>
    <h1>Authorize Hem CLI</h1>
    <p>Confirm that the code shown in your terminal is <code id="code"></code>.</p>
    <form id="credentials">
      <label>Name <input id="name" autocomplete="name" name="name" type="text"></label>
      <label>Email <input autocomplete="email" name="email" required type="email"></label>
      <label>Password <input autocomplete="current-password" minlength="8" name="password" required type="password"></label>
      <div class="actions">
        <button name="intent" type="submit" value="sign-in">Sign in</button>
        <button name="intent" type="submit" value="sign-up">Create account</button>
      </div>
    </form>
    <button hidden id="authorize" type="button">Authorize this device</button>
    <p aria-live="polite" id="status"></p>
  </main>
  <script type="module">
    const userCode = new URL(location.href).searchParams.get('user_code');
    const button = document.querySelector('#authorize');
    const form = document.querySelector('#credentials');
    const status = document.querySelector('#status');
    document.querySelector('#code').textContent = userCode ?? 'missing';

    const json = (path, init) => fetch(path, {
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      ...init,
    });

    const approve = async () => {
	  button.disabled = true;
      if (!userCode) {
        status.textContent = 'The device code is missing.';
        return;
      }

	  const claim = await json('/v1/auth/device?user_code=' + encodeURIComponent(userCode));
      if (!claim.ok) {
        status.textContent = 'This device request is invalid or expired.';
        return;
      }
      const approval = await json('/v1/auth/device/approve', {
        method: 'POST',
        body: JSON.stringify({ userCode }),
      });
	  status.textContent = approval.ok
	    ? 'Hem CLI is authorized. You can close this window.'
	    : 'The device request could not be approved.';
	};

    button.addEventListener('click', approve);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const intent = event.submitter?.value;
      const payload = {
        email: data.get('email'),
        password: data.get('password'),
      };
      if (intent === 'sign-up') payload.name = data.get('name');

      status.textContent = intent === 'sign-up' ? 'Creating account…' : 'Signing in…';
      const response = await json(
        intent === 'sign-up' ? '/v1/auth/sign-up/email' : '/v1/auth/sign-in/email',
        { method: 'POST', body: JSON.stringify(payload) },
      );
      if (!response.ok) {
        const error = await response.json();
        status.textContent = error.message ?? 'Authentication failed.';
        return;
      }
      form.hidden = true;
      button.hidden = false;
      status.textContent = '';
      await approve();
    });

    const session = await json('/v1/auth/get-session');
    if (session.ok && await session.json()) {
      form.hidden = true;
      button.hidden = false;
    }
  </script>
</body>
</html>`;