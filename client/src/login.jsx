import React, { useState } from 'react';
import './login.css';
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from './firebase';

function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true); // Toggle between login and signup
  const [passwordValid, setPasswordValid] = useState(true);

  const collegeEmailDomain = '@stu.srhu.edu.in';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Both fields are required!');
      return;
    }

    if (!email.endsWith(collegeEmailDomain)) {
      setError(`Please use your college email ending with ${collegeEmailDomain}`);
      return;
    }

    if (!passwordValid) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    try {
      setLoading(true);
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      setLoading(false);
      onLoginSuccess();
    } catch (err) {
      setLoading(false);
      console.error("Auth error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    }
  };

  const handlePasswordChange = (e) => {
    const passwordInput = e.target.value;
    setPassword(passwordInput);
    setPasswordValid(passwordInput.length >= 6); // Check password length
  };

  return (
    <div className="login-container">
      <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="input-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="user_email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your college email"
            autoComplete="off"
            disabled={loading} // Disable input during loading
          />
        </div>

        <div className="input-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="user_password"
            value={password}
            onChange={handlePasswordChange}
            placeholder="Enter your password"
            autoComplete="off"
            disabled={loading} // Disable input during loading
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        <button type="submit" className="login-btn" disabled={loading || !passwordValid}>
          {loading ? (isLogin ? 'Logging in...' : 'Signing up...') : (isLogin ? 'Login' : 'Sign Up')}
        </button>
      </form>

      <p className="switch-auth">
        {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
        <button
          type="button"
          className="link-button"
          onClick={() => setIsLogin(!isLogin)}
          disabled={loading} // Disable button during loading
        >
          {isLogin ? 'Sign Up' : 'Login'}
        </button>
      </p>
    </div>
  );
}

export default Login;
