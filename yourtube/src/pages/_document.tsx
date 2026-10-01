import { Html, Head, Main, NextScript } from "next/document";

const themeScript = `(function(){try{var preference=localStorage.getItem('yourtube2_theme_preference');var hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).format(new Date()));var theme=preference==='light'||preference==='dark'?preference:(hour>=5&&hour<12?'light':'dark');document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.dataset.yourtube2Theme=theme;document.documentElement.style.colorScheme=theme;}catch(_){}})();`;

export default function Document() {
  return (
    <Html lang="en" suppressHydrationWarning>
      <Head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
