$httpClient.get("https://api.country.is/", function (error, response, data) {
    let parsed_data = JSON.parse(data);
    let content_string = parsed_data.ip + " (" + parsed_data.country + ")";
    $done({
        content: content_string,
    })
})