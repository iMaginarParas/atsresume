/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to ATS Pro Resume Builder — confirm your email</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://hkgevmagiqcbndvkbekk.supabase.co/storage/v1/object/public/email-assets/logo.webp" width="44" height="44" alt="ATS Pro Resume Builder" style={logo} />
        <Heading style={h1}>Welcome aboard! 🎉</Heading>
        <Text style={text}>
          Thanks for signing up for{' '}
          <Link href={siteUrl} style={link}>
            <strong>ATS Pro Resume Builder</strong>
          </Link>
          ! You're one step away from building ATS-optimized resumes that land interviews.
        </Text>
        <Text style={text}>
          Please confirm your email (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ) to get started:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Get Started
        </Button>
        <Text style={footer}>
          If you didn't create an account, you can safely ignore this email.
        </Text>
        <Text style={copyright}>
          © {new Date().getFullYear()} ATS Pro Resume Builder. All rights reserved.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
const link = { color: '#3b82f6', textDecoration: 'underline' }
const button = {
  backgroundColor: '#3b82f6',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '12px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block' as const,
}
const footer = { fontSize: '13px', color: '#94a3b8', margin: '32px 0 0', lineHeight: '1.5' }
const copyright = { fontSize: '12px', color: '#cbd5e1', margin: '24px 0 0', textAlign: 'center' as const }
