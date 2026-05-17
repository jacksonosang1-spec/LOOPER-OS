
async function main() {
  const url = 'http://0.0.0.0:3000/api/admin/leads';
  console.log(`Fetching from ${url}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
       console.error(`HTTP error! status: ${res.status}`);
       return;
    }
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e: any) {
    console.error(`Fetch failed for ${url}:`, e.message);
  }
}
main();
