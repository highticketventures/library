# Supabase Webflow Integration

## Usage

1. Add the script to Webflow to the entire site of the Custom Code section:

```html
<!-- Library SupaBase Logic -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js"></script>
<script>
  fetch("https://htv-library.netlify.app/.netlify/functions/get-supabase-key")
    .then((res) => res.json())
    .then(({ supabaseUrl, supabaseKey }) => {
      if (!window.supabase) {
        console.error("Supabase JS library is not loaded!");
        return;
      }
      window.supabaseInstance = window.supabase.createClient(
        supabaseUrl,
        supabaseKey
      );

      var script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/gh/highticketventures/library@0bbea0cde64ba9f352494dd7b422dd03e1e4c806/supabase-client.js";
      script.onload = function() {
        var script2 = document.createElement("script");
        script2.src =
          "https://cdn.jsdelivr.net/gh/highticketventures/library@10b20a44ed69f63e22ba155e65ca7b744586e756/supabase_sort_current.js";
        script2.onload = function() {
          if (window.refreshListing) window.refreshListing();
        };
        document.body.appendChild(script2);
      };
      document.body.appendChild(script);
    });
</script>
```

2. Add the snippet to inner CMS page template

```html
<script>
  (function() {
    let waitTries = 0;
    const waitMaxTries = 20;
    const waitInterval = setInterval(() => {
      if (
        typeof window.initDetailLikeView === "function" &&
        window.LIKE_BLOCK_SELECTOR
      ) {
        clearInterval(waitInterval);
        let tries = 0;
        const maxTries = 20;
        const interval = setInterval(() => {
          const likeBlocks = document.querySelectorAll(
            window.LIKE_BLOCK_SELECTOR
          );
          if (likeBlocks.length) {
            window.initDetailLikeView();
            clearInterval(interval);
          }
          tries++;
          if (tries > maxTries) clearInterval(interval);
        }, 250);
      }
      waitTries++;
      if (waitTries > waitMaxTries) clearInterval(waitInterval);
    }, 250);
  })();
</script>
```
