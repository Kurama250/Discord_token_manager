try {
    const webauthnBlock = `(function(){const deny=()=>Promise.reject(new DOMException('Aborted','AbortError'));try{Object.defineProperty(navigator,'credentials',{value:{create:deny,get:deny,store:deny,preventSilentAccess:()=>Promise.resolve()},writable:false,configurable:true});}catch(e){}try{window.PublicKeyCredential=class{static isUserVerifyingPlatformAuthenticatorAvailable(){return Promise.resolve(false)}static isConditionalMediationAvailable(){return Promise.resolve(false)}};}catch(e){}})();`;

    const inject = () => {
        const script = document.createElement('script');
        script.textContent = webauthnBlock;
        const target = document.head || document.documentElement;
        if (target) {
            target.appendChild(script);
            script.remove();
        }
    };

    if (document.documentElement) {
        inject();
    } else {
        new MutationObserver((_m, obs) => {
            if (document.documentElement) {
                obs.disconnect();
                inject();
            }
        }).observe(document, { childList: true, subtree: true });
    }
} catch (e) {}
