const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const {
      apiToken,
      domain,
      clientName,
      clientNip,
      issueDate,
      saleDate,
      dueDate,
      positions,
    } = await req.json();

    if (!apiToken || !domain) {
      return new Response(
        JSON.stringify({ error: 'Brak tokenu lub domeny Fakturowni.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apiUrl = `https://corsproxy.io/?${encodeURIComponent(`https://${domain}.fakturownia.pl/invoices.json`)}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_token: apiToken,
        invoice: {
          kind: 'vat',
          buyer_name: clientName,
          buyer_tax_no: clientNip || '',
          issue_date: issueDate,
          sell_date: saleDate,
          payment_to: dueDate,
          positions: positions.map((item: { name: string; quantity: number; total_price_net: number; tax: number; total_price_gross: number }) => ({
            name: item.name,
            quantity: item.quantity,
            total_price_net: item.total_price_net,
            tax: item.tax,
            total_price_gross: item.total_price_gross,
          })),
        },
      }),
    });

    if (!response.ok) {
      let errMessage = `Błąd Fakturowni: HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        console.error('FAKTUROWNIA API ERROR:', errBody);
        errMessage = `Błąd Fakturowni: ${errBody.message || JSON.stringify(errBody)}`;
      } catch {
        const errText = await response.text();
        console.error('FAKTUROWNIA API ERROR (non-JSON):', errText);
        if (errText) errMessage = `Błąd Fakturowni: ${errText}`;
      }
      return new Response(
        JSON.stringify({ error: errMessage }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result = await response.json();
    console.log('FAKTUROWNIA SUCCESS:', { number: result.number, pdf_url: result.pdf_url });

    return new Response(
      JSON.stringify({
        invoice_number: result.number ?? '—',
        pdf_url: result.pdf_url ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Nieznany błąd' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
