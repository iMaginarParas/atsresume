/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code — ATS Pro Resume Builder</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://hkgevmagiqcbndvkbekk.supabase.co/storage/v1/object/public/email-assets/logo.webp" width="44" height="44" alt="ATS Pro Resume Builder" style={logo} />
        <Heading style={h1}>Confirm your identity</Heading>
        <Text style={text}>Use the code below to verify it's you:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code expires shortly. If you didn't request this, you can safely ignore this email.
        </Text>
        <Text style={copyright}>
          © {new Date().getFullYear()} ATS Pro Resume Builder. All rights reserved.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'DM Sans', 'Nunito', Arial, sans-serif" }
const container = { padding: '40px 32px', maxWidth: '480px', margin: '0 auto' }
const logo = { marginBottom: '24px' }
const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#0f172a',
  margin: '0 0 20px',
  fontFamily: "'Nunito', Arial, sans-serif",
}
const text = {
  fontSize: '15px',
  color: '#64748b',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const codeStyle = {
  fontFamily: "'JetBrains Mono', Courier, monospace",
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#3b82f6',
  margin: '0 0 30px',
  letterSpacing: '4px',
}
const footer = { fontSize: '13px', color: '#94a3b8', margin: '32px 0 0', lineHeight: '1.5' }
const copyright = { fontSize: '12px', color: '#cbd5e1', margin: '24px 0 0', textAlign: 'center' as const }
