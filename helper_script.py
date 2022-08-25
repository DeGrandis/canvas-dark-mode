# too many emails
# need help doing this
# script to add formatting

urls = open('tempurls.txt', 'r')
lines = urls.readlines()

output = open(".\out.txt", "w")
for line in lines:
    output.write("\"" +  line.strip() + "*\",\n")

output.close()