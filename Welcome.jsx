import React, {useState,useEffect} from 'react';

import {Recovery} from './Recovery.jsx';

function Street() {
  return <div className="street" aria-hidden="true">
    <i className="sun"/><i className="cloud cloud-one"/><i className="cloud cloud-two"/>
    <div className="houses">{['peach','blue','ochre'].map(color=><div className={'house '+color} key={color}>
      <div className="windows">{[0,1,2,3].map(i=><i key={i}/>)}</div><b className="door"/>
    </div>)}</div><i className="tree"/><i className="pavement"/>
  </div>;
}

export function Welcome({submit}) {
  const [register,setRegister]=useState(false);
  const [email,setEmail]=useState('');
  const [recovery,setRecovery]=useState(null);
  const [emailOtp,setEmailOtp]=useState(false);
  useEffect(()=>{
    let active=true;
    fetch('/api/auth-methods').then(async response=>{
      if(response.ok && (await response.json()).emailOtp && active) setEmailOtp(true);
    }).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  async function authenticate(event) {
    const result=await submit(register?'register':'login')(event);
    if(result?.verificationRequired) setRecovery({flow:'verify',hasCode:true});
  }
  return <div className="welcome">
    <div className="welcome-story">
      <div className="welcome-copy"><h1>Find your place.<br/><em>Meet your people.</em></h1>
      <p>Discover flats, rooms and people who make a place feel like home.</p></div><Street/>
    </div>
    {recovery?<Recovery {...recovery} initialEmail={email} onBack={()=>{setRecovery(null);setRegister(false);}}/>:
    <form className="welcome-form" onSubmit={authenticate}>
      <h2>{register?'Create an account':'Welcome back'}</h2>
      <p>{register?'Start your search with AlternateMe.':'Sign in to your AlternateMe account.'}</p>
      {register && <label>Display name<input name="name" autoComplete="nickname" maxLength={80} required/></label>}
      <label>Email address<input name="email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label>
      <label>Password<input name="password" type="password" autoComplete={register?'new-password':'current-password'} minLength={8} maxLength={256} required/></label>
      <button className="welcome-primary">{register?'Create account':'Sign in'} <span aria-hidden="true">→</span></button>
      <div className="auth-switch">{register?'Already have an account?':'New to AlternateMe?'} <button type="button" onClick={()=>setRegister(!register)}>{register?'Sign in':'Create an account'}</button></div>
      {emailOtp && !register && <div className="recovery-links">
        <button type="button" onClick={()=>setRecovery({flow:'reset',hasCode:false})}>Forgot password?</button>
        <button type="button" onClick={()=>setRecovery({flow:'verify',hasCode:false})}>Verify email</button>
      </div>}
    </form>}
  </div>;
}
