all:
	poetry lock && poetry install
	poetry run pip install setuptools

install:
	-sudo rm -f /usr/local/bin/mapboard
	sudo ln -s $(PWD)/bin/mapboard /usr/local/bin/mapboard
