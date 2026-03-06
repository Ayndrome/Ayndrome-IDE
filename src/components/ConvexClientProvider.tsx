"use-client";

/*

This component provides the Convex client to the app.
It uses the ConvexProviderWithClerk component from the convex/react-clerk package
to integrate Convex with Clerk authentication.

*/


import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from 'convex/react'


if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error('Missing NEXT_PUBLIC_CONVEX_URL in your .env file')
}


const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL)


export default function ConvexClientProvider({children}: {children: React.ReactNode}){

    // TODO: Add error handling and loading states
    return(

        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            {children}
        </ConvexProviderWithClerk>

    );
}