# לקוח – השאלת מחשבים

ממשק React לשרת השאלת המחשבים. כתובת השרת נמצאת רק ב-`VITE_API_URL`, לא בקוד.

```bash
copy .env.example .env
npm install
npm run dev
```

האתר נפתח ב-http://localhost:5173. ב-`.env.example` הכתובת היא `http://localhost:5045`, והשרת צריך לרוץ לפני ההתחברות.

משתמשי דמו: `admin@demo.com` / `Admin123!` (Admin), `user@demo.com` / `User123!` (Borrower).

## העלאה ל-Render

Static Site מול ה-repository הזה. ב-Build Command: `npm ci && npm run build`. ב-Publish Directory: `dist`. אפשר גם New → Blueprint עם `render.yaml`.

לפני הבילד הראשון מגדירים `VITE_API_URL` לכתובת השרת ב-Render, למשל `https://computer-lending-api.onrender.com`, בלי סלאש בסוף. Vite קורא את המשתנה רק בזמן בנייה, אז שינוי שלו דורש Deploy מחדש.

שם השירות ב-`render.yaml` הוא `computer-lending-client`, והכתובת הצפויה היא `https://computer-lending-client.onrender.com`. השרת כבר מתיר את המקור הזה ב-CORS. אם Render נותן כתובת אחרת, מעדכנים בשרת את `Cors__Origins__1`.
