import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { McpAuthClient } from './mcp-auth-client';

/**
 * NextAuth.js configuration options for Hedera authentication
 * Provides credentials-based authentication using Hedera account signatures
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Hedera',
      credentials: {},
      async authorize(credentials, req) {
        try {
          const { accountId, signature, challenge } = credentials as any;
          
          if (!accountId || !signature || !challenge) {
            return null;
          }

          const response = await fetch(`${process.env.MCP_SERVER_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId, signature, challenge })
          });

          if (!response.ok) {
            return null;
          }

          const { apiKey } = await response.json();

          return {
            id: accountId,
            accountId,
            apiKey
          };
        } catch (error) {
          return null;
        }
      }
    })
  ],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accountId = user.accountId;
        token.apiKey = user.apiKey;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user = {
          accountId: token.accountId as string
        };
        session.apiKey = token.apiKey as string;
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin'
  }
};