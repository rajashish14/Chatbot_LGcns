
require('dotenv').config();
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const twilio = require('twilio'); 

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const client = twilio(accountSid, authToken);

let otps = {}; // In-memory OTP store

router.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otps[phone] = otp;

  try {
    await client.messages.create({
      body: `Your OTP is: ${otp}`,
      from: twilioPhone,
      to: phone.startsWith('+') ? phone : `+91${phone}` // Adjust country code as needed
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Twilio error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

router.post('/login', async (req, res) => {
  const { phone, firstName, middleName, lastName, email, otp } = req.body;
  if (!otps[phone] || otps[phone] !== otp) {
    return res.status(401).json({ error: 'Invalid OTP' });
  }
  delete otps[phone];
  let user = await User.findOne({ phone });
  if (!user && firstName && lastName) {
    const name = [firstName, middleName, lastName].filter(Boolean).join(' ');
    user = await User.create({ phone, name, email });
  }
  res.json({ success: true, user });
});

router.post('/check-user', async (req, res) => {
  const { phone } = req.body;
  const user = await User.findOne({ phone });
  res.json({ exists: !!user });
});


module.exports = router;