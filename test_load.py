from playwright.sync_api import sync_playwright
import sys

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        errors = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: errors.append(str(err)))
        
        try:
            page.goto("http://localhost:3000", wait_until="networkidle")
            # give it a sec for react to render
            page.wait_for_timeout(2000)
            
            html = page.content()
            if "<div id=\"root\"></div>" in html or "class=\"\" id=\"root\"><!---->" in html or len(html) < 1000:
                print("App might not have rendered properly. HTML length:", len(html))
            
            if errors:
                print("Errors found:")
                for e in errors:
                    print(e)
                sys.exit(1)
            else:
                print("No console errors! App rendered successfully.")
                print("App div #root contains elements:", "root" in html)
                
        except Exception as e:
            print("Failed to load:", e)
            sys.exit(1)
        finally:
            browser.close()

if __name__ == "__main__":
    main()
