$httpClient.get("http://ip-api.com/json/?lang=zh-CN", function (error, response, data) {
    let parsed_data = JSON.parse(data);
    let content_string = parsed_data.query + " (" + parsed_data.country + ")";
    $done({
        content: content_string,
    })
})