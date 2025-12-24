declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (params: {
        appId: string;
        cookie: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      AppEvents: {
        logPageView: () => void;
      };
    };
  }
}

export const metaSDKInit = () => {
  if (document.getElementById("facebook-jssdk")) {
    console.log("Meta SDK already loaded");
    return;
  }

  const appId = import.meta.env.VITE_META_APP_ID || "1378729573873020";
  const apiVersion = import.meta.env.VITE_META_API_VERSION || "v20.0";

  window.fbAsyncInit = function () {
    if (!window.FB) {
      console.error("FB object not available");
      return;
    }

    window.FB.init({
      appId: appId,
      cookie: true,
      xfbml: true,
      version: apiVersion,
    });

    window.FB.AppEvents.logPageView();
    console.log("✅ Meta SDK initialized successfully for Ghoste.one");
    console.log(`✅ Meta SDK connected and ready for API testing`);
    console.log(`   App ID: ${appId}`);
    console.log(`   API Version: ${apiVersion}`);
    console.log(`   Scopes: ads_read, ads_management, business_management, pages_show_list, public_profile`);
  };

  (function (d, s, id) {
    const fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) return;

    const js = d.createElement(s) as HTMLScriptElement;
    js.id = id;
    js.src = "https://connect.facebook.net/en_US/sdk.js";
    js.async = true;
    js.defer = true;

    if (fjs && fjs.parentNode) {
      fjs.parentNode.insertBefore(js, fjs);
    } else {
      d.head.appendChild(js);
    }
  })(document, "script", "facebook-jssdk");
};
