import React, {useState} from 'react';

export function Recovery({flow,initialEmail,hasCode,onBack}) {
  const verify=flow==='verify';
  const [email,setEmail]=useState(initialEmail);
  const [sent,setSent]=useState(hasCode);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [done,setDone]=useState(false);
  const [otp,setOtp]=useState('');
  async function process(event) {
    event.preventDefault();
    if(busy) return;
    const resend=event.nativeEvent.submitter?.value==='resend';
    const request=!sent || resend;
    const path=request?(verify?'request-verification':'request-password-reset'):(verify?'verify-email':'reset-password');
    const data={email};
    if(!request) {
      data.otp=otp;
      if(!verify) data.password=event.currentTarget.elements.password.value;
    }
    setBusy(true);
    setMessage('');
    try {
      const response=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      if(!response.ok) throw Error((await response.json()).error || 'Please try again.');
      if(request) {
        setSent(true);
        setOtp('');
        setMessage('If your account is eligible, a new code is on its way. Check your inbox and spam folder.');
      } else {
        setDone(true);
        setMessage(verify?'Email verified. Continue to sign in.':'Your password has been updated. Sign in with your new password.');
      }
    } catch(error) {setMessage(error.message);}
    finally {setBusy(false);}
  }
  return <form className="welcome-form" onSubmit={process}><h2>{verify?'Verify your email':'Reset your password'}</h2>
    {!done && <><p>{sent?'Enter the six-digit code sent to '+email+'.':'Enter your account email to request a six-digit code.'}</p>
      <fieldset disabled={busy}>
        {!sent && <label>Email address<input name="email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>}
        {sent && <label>Email code<input name="otp" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value)} required/></label>}
        {sent && !verify && <label>New password<input type="password" name="password" autoComplete="new-password" minLength={8} maxLength={256} required/></label>}
        <button className="welcome-primary">{sent?(verify?'Verify email':'Reset password'):'Send code'}</button>
        {sent && <button type="submit" value="resend" formNoValidate>Send a new code</button>}
      </fieldset></>}
    <p role="status">{message}</p><button type="button" disabled={busy} onClick={()=>done && verify?window.location.reload():onBack()}>Back to sign in</button>
  </form>;
}
