all:
	cd mapboard-cli && poetry install

install:
	rm -f /usr/local/bin/mapboard
	ln -s $(PWD)/mapboard-cli/bin/mapboard /usr/local/bin/mapboard