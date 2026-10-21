const redirectWorker = {
  fetch(request) {
    const destination = new URL(request.url);
    destination.protocol = "https:";
    destination.hostname = "portuguesewithines.com";
    destination.port = "";

    // The canonical site sends HSTS from its own _headers; these hosts only
    // redirect, so they say it themselves, and a typed www address is not
    // left to plain http on the next visit.
    return new Response(null, {
      status: 301,
      headers: {
        Location: destination.toString(),
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
      }
    });
  }
};

export default redirectWorker;
