// Managed Better Auth uses the email OTP plugin's REST API.
// https://better-auth.com/docs/plugins/email-otp
export function registerRecoveryRoutes(app,{auth,fail,field,cookies}) {
  app.get('/api/auth-methods',async()=>({emailOtp:true}));
  const routes=[
    ['request-verification','send-verification-otp'],
    ['verify-email','verify-email'],
    ['request-password-reset','request-password-reset'],
    ['reset-password','reset-password']
  ];
  for (const [action,endpoint] of routes) {
    app.post('/api/'+action,async(req,reply)=>{
      const email=field(req.body,'email',254);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Enter a valid email address.');
      const data={email};
      if(action==='request-verification') data.type='email-verification';
      if(action==='verify-email' || action==='reset-password') {
        data.otp=field(req.body,'otp',12);
        if(!/^\d{6}$/.test(data.otp)) fail(400,'Enter the six-digit email code.');
      }
      if(action==='reset-password') {
        data.password=req.body.password;
        if(typeof data.password!=='string'||data.password.length<8||data.password.length>256) fail(400,'Use a password of 8–256 characters.');
      }
      const response=await auth('email-otp/'+endpoint,req,data);
      if(!response.ok) {
        if(response.status===429) fail(429,'Too many attempts. Please wait before trying again.');
        if(response.status>=500) fail(502,'Email authentication is temporarily unavailable.');
        fail(400,data.otp?'Check your code or request a new one.':'Unable to request a code. Try again later.');
      }
      if(action==='verify-email') cookies(response,reply);
      return {ok:true};
    });
  }
}
