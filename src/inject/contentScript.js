//fires one second after page load.
//sometimes all elements are not created.
$(document).ready(function() {
	var primaryColorArray = ["--ic-brand-primary", "--ic-link-color", "--ic-brand-global-nav-bgd", "--ic-brand-global-nav-logo-bgd", "--ic-brand-Login-body-bgd-color", "--ic-brand-Login-body-bgd-shadow-color"];
	var secondaryColorArray = ["", ""];
	for (var i = 0; i < primaryColorArray.length; i++) {
		//document.documentElement.style.setProperty(primaryColorArray[i], '#282828');
	}

	for (var i = 0; i < secondaryColorArray.length; i++) {
		//document.documentElement.style.setProperty(secondaryColorArray[i], '#1f1f1f');
	}
	//document.body.style.background = "#1f1f1f";

	//classNameBGChange("ic-DashboardCard__header_content", "#282828");
	//classNameBGChange("ic-DashboardCard__action-container", "#282828");
	//classNameBGChange("ic-DashboardCard", "#282828");
	//classNameBGChange("large ic-Dashboard-header__layout", "#1f1f1f");
	//document.getElementsByClassName("ic-Dashboard-header__title")[0].style.color = "#fff";
});


function classNameBGChange(classname, color) {
	var cards = document.getElementsByClassName(classname)
	for (var i = 0; i < cards.length; i++) {
		if (!(cards[i].style.background === undefined)) {
			cards[i].style.background = color;
		}
	}
}
