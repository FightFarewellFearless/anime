self.addEventListener("push", e => {

    // Data from service
    const data = e.data.json();
    console.log("Push Recieved...");
    self.registration.showNotification(data.title, {
        body: data.body
    });
});