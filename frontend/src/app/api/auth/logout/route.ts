import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    // Get cookie store
    const cookieStore = await cookies();
    
    // Clear all NextAuth cookies (httpOnly cookies must be cleared server-side)
    const authCookies = [
      'authjs.session-token',
      'authjs.csrf-token',
      'authjs.callback-url',
      '__Secure-authjs.session-token', // Secure variant
      '__Host-authjs.csrf-token', // Host variant
    ];
    
    // Delete each cookie
    authCookies.forEach(cookieName => {
      cookieStore.delete(cookieName);
    });
    
    return NextResponse.json({ 
      success: true,
      message: "Cookies cleared"
    });
    
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { success: false, error: "Logout failed" },
      { status: 500 }
    );
  }
}

