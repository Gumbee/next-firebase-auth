import { useEffect, useState } from 'react'
import { getConfig } from 'src/config'
import createAuthUser from 'src/createAuthUser'
import { filterStandardClaims } from 'src/claims'
import logDebug from 'src/logDebug'
import { getAuth } from 'firebase/auth'

const defaultTokenChangedHandler = async (authUser) => {
  const { loginAPIEndpoint, logoutAPIEndpoint } = getConfig()
  let response
  // If the user is authed, call login to set a cookie.
  if (authUser.id) {
    const userToken = await authUser.getIdToken()
    response = await fetch(loginAPIEndpoint, {
      method: 'POST',
      headers: {
        Authorization: userToken,
      },
      credentials: 'include',
    })
    if (!response.ok) {
      const responseJSON = await response.json()
      throw new Error(
        `Received ${
          response.status
        } response from login API endpoint: ${JSON.stringify(responseJSON)}`
      )
    }
  } else {
    // If the user is not authed, call logout to unset the cookie.
    response = await fetch(logoutAPIEndpoint, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) {
      const responseJSON = await response.json()
      throw new Error(
        `Received ${
          response.status
        } response from logout API endpoint: ${JSON.stringify(responseJSON)}`
      )
    }
  }
  return response
}

const setAuthCookie = async (firebaseUser) => {
  const { tokenChangedHandler } = getConfig()

  const authUser = createAuthUser({
    firebaseUserClientSDK: firebaseUser,
    clientInitialized: true,
  })

  if (tokenChangedHandler) {
    return tokenChangedHandler(authUser)
  }

  return defaultTokenChangedHandler(authUser)
}

const useFirebaseUser = () => {
  const [userInfo, setUserInfo] = useState({
    user: undefined, // unmodified Firebase user, undefined if not authed
    claims: {},
    initialized: false,
  })
  const [isAuthCookieRequestComplete, setIsAuthCookieRequestComplete] =
    useState(false)

  useEffect(() => {
    let isCancelled = false

    const onIdTokenChange = async (firebaseUser) => {
      logDebug('Firebase ID token changed. Firebase user:', firebaseUser)

      setIsAuthCookieRequestComplete(false)
      let customClaims = {}
      if (firebaseUser) {
        // Get the user's claims:
        // https://firebase.google.com/docs/reference/js/firebase.auth.IDTokenResult
        const idTokenResult = await getAuth().currentUser.getIdTokenResult()
        customClaims = filterStandardClaims(idTokenResult.claims)
      }

      setUserInfo({
        user: firebaseUser,
        claims: customClaims,
        initialized: true,
      })

      logDebug('Starting auth API request via tokenChangedHandler.')

      await setAuthCookie(firebaseUser)

      // Cancel state updates if the component has unmounted. We could abort
      // fetches, but that would not currently support any async logic in the
      // user-defined "tokenChangedHandler" option.
      // https://developers.google.com/web/updates/2017/09/abortable-fetch
      // If we were to do the above, we might optionally have
      // "tokenChangedHandler" return an unsubscribe function.
      if (!isCancelled) {
        setIsAuthCookieRequestComplete(true)
        logDebug('Completed auth API request via tokenChangedHandler.')
      } else {
        logDebug(
          'Component unmounted before completing auth API request via tokenChangedHandler.'
        )
      }
    }

    // https://firebase.google.com/docs/reference/js/firebase.auth.Auth#onidtokenchanged
    const unsubscribe = getAuth().onIdTokenChanged(onIdTokenChange)
    return () => {
      unsubscribe()
      isCancelled = true
    }
  }, [])

  return {
    ...userInfo,
    authRequestCompleted: isAuthCookieRequestComplete,
  }
}

export default useFirebaseUser
